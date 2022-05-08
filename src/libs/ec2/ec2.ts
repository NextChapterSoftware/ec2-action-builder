
import { Config, ConfigInterface } from '../config/config';
import * as _ from "lodash"
import AWS, { Pricing } from 'aws-sdk';
import { UserData } from './userdata';
import { Ec2Pricing } from './pricing';

interface Tag {
    Key: string;
    Value: string;
}

interface InstanceTypeInterface {
    name: string;
    vcpu: number;
}


export class Ec2Instance {
    config: ConfigInterface;
    client: AWS.EC2;
    tags: Tag[];
    credentials: AWS.Credentials;

    constructor(config: ConfigInterface) {
        this.config = config;
        this.credentials = new AWS.Credentials(
            {
                accessKeyId: this.config.awsAccessKeyId,
                secretAccessKey: this.config.awsSecretAccessKey
            }
        );
        //AWS.config.lo
        this.client = new AWS.EC2({
            credentials: this.credentials,
            region: this.config.awsRegion
        });

        this.tags = this.getTags();
    }

    async getEc2Client(): Promise<AWS.EC2> {

        const credentials = (this.config.awsAssumeRole) ? await this.getCrossAccountCredentials() : this.credentials
        return new AWS.EC2({
            credentials: credentials,
            region: this.config.awsRegion
        });
    }

    getTags() {
        return [
            {
                Key: "name",
                Value: this.config.githubJobId
            },
            {
                Key: "github_ref",
                Value: this.config.githubRef
            },
            {
                Key: "owner",
                Value: "EC2_ACTION_BUILDER"
            },
            /*
            {
                Key: "expiration",
                Value: "some time goes here"
            },
            */
        ]
    }

    getCrossAccountCredentials() {

        const stsClient = new AWS.STS({
            credentials: this.credentials,
            region: this.config.awsRegion
        });
        return new Promise<AWS.Credentials>((resolve, reject) => {
            const timestamp = (new Date()).getTime();
            const params = {
                RoleArn: this.config.awsIamRoleArn,
                RoleSessionName: `ec2-action-builder-${this.config.githubJobId}-${timestamp}`
            };
            stsClient.assumeRole(params, (err, data) => {
                if (err)
                    reject(err);
                else {
                    // TODO: handle this better and cleaner
                    if (data.Credentials) {
                        resolve(new AWS.Credentials(
                            {
                                accessKeyId: data.Credentials.AccessKeyId,
                                secretAccessKey: data.Credentials.SecretAccessKey,
                                sessionToken: data.Credentials.SessionToken,
                            })
                        );
                    }
                }
            });
        });
    }

    async runInstances(params) {
        return new Promise<AWS.EC2.InstanceList>((resolve, reject) => {
            this.client.runInstances(params, (err, data) => {
                if (err) {
                    return reject(err);
                }
                if (data.Instances)
                    resolve(data.Instances);
                else 
                    reject(null)
            });
        });
    }

    // not used
    async getAllSubnets() {

        const client = await this.getEc2Client()
        return new Promise<AWS.EC2.SubnetList>((resolve, reject) => {
            client.describeSubnets({}, (err, data) => {
                if (err) {
                    return reject(err);
                }
                if (data.Subnets?.length && data.Subnets?.length > 0)
                    resolve(data.Subnets);
                else
                    reject(null)
            });
        });
    }

    async getSubnetAz() {
        const client = await this.getEc2Client()

        return new Promise<string>((resolve, reject) => {
            const params = {
                SubnetIds: [
                    this.config.ec2SubnetId
                ]
            };
            client.describeSubnets(params, (err, data) => {
                if (err) {
                    return reject(err);
                }
                // TODO this should be cleaner
                if (data.Subnets?.length && data.Subnets?.length > 0)
                    if (data.Subnets[0].AvailabilityZone)
                        resolve(data.Subnets[0].AvailabilityZone?.toString());
                reject(null)
            });
        });
    }

    async getSpotInstancePrice(instanceType: string) {

        const params = {
            AvailabilityZone: await this.getSubnetAz(),
            //EndTime: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789,
            InstanceTypes: [
                (instanceType) ? instanceType : this.config.ec2InstanceType,
            ],
            ProductDescriptions: [
                'Linux/UNIX'
                // 'Red Hat Enterprise Linux'
                // 'SUSE Linux'
                // 'Windows'
            ],
            StartTime: new Date
        };

        return new Promise<number>((resolve, reject) => {

            this.client.describeSpotPriceHistory(params, (err, data) => {
                if (err)
                    return reject(err);

                if (data.SpotPriceHistory?.length == 1 && data.SpotPriceHistory[0].SpotPrice)
                    resolve(Number(data.SpotPriceHistory[0].SpotPrice));
                else
                    reject(-1)
            });
        });
    }

    async getInstanceSizesForType(instanceClass: string, includeBareMetal: boolean = false) {

        var params = {
            Filters: [
                {
                    Name: 'instance-type',
                    Values: [
                        `${instanceClass}.*`,
                    ]
                },
                {
                    Name: 'bare-metal',
                    Values: [`${includeBareMetal}`]
                }
            ],
            MaxResults: 99,
        };

        var instanceTypesList: InstanceTypeInterface[] = []
        var nextToken: string = '';
        do {
            const response = (await this.client.describeInstanceTypes(params).promise())
            response.InstanceTypes?.forEach(function (item) {
                if (item.InstanceType && item.VCpuInfo?.DefaultCores)
                    instanceTypesList.push({
                        name: item.InstanceType,
                        vcpu: item.VCpuInfo?.DefaultCores
                    });
            });


            nextToken = (response.NextToken) ? response.NextToken : '';
            params = { ...params, ...{ NextToken: nextToken } };
        } while (nextToken)

        return _.orderBy(instanceTypesList, 'vcpu');
    }

    async getNextLargerInstanceType(instanceType: string) {
        const instanceClass = instanceType.toLowerCase().split(".")[0];
        var instanceTypeList = await this.getInstanceSizesForType(instanceClass);
        instanceTypeList = instanceTypeList.filter(function (item) {
            return !item.name.includes("metal");
        });

        const currentInstanceTypeIndex = instanceTypeList.map(function (e) { return e.name; }).indexOf(instanceType);
        const nextInstanceTypeIndex = (currentInstanceTypeIndex + 1 < instanceTypeList.length) ? currentInstanceTypeIndex + 1 : currentInstanceTypeIndex
        return instanceTypeList[nextInstanceTypeIndex].name
    }

    async bestSpotSizeForOnDemandPrice(instanceType: string) {
        const ec2Pricing = new Ec2Pricing(this.config);
        const currentOnDemandPrice = await ec2Pricing.getPriceForInstanceTypeUSD(this.config.ec2InstanceType)
        console.log(`current ondemand price ${currentOnDemandPrice}`)

        var previousInstanceType = this.config.ec2InstanceType
        var bestInstanceType = this.config.ec2InstanceType
        do {
            const nextLargerInstance = await this.getNextLargerInstanceType(bestInstanceType)
            const spotPriceForLargerInstance = await this.getSpotInstancePrice(nextLargerInstance)
            previousInstanceType = bestInstanceType
            if (spotPriceForLargerInstance > 0 && currentOnDemandPrice > spotPriceForLargerInstance) {
                console.log("here")
                bestInstanceType = nextLargerInstance
            }


        } while (bestInstanceType != previousInstanceType)

        return bestInstanceType

    }

    async getInstanceConfiguration() {
        const ec2Pricing = new Ec2Pricing(this.config);
        const currentInstanceTypePrice = await ec2Pricing.getPriceForInstanceTypeUSD(this.config.ec2InstanceType)

        const userData = new UserData(this.config);

        var params = {
            ImageId: this.config.ec2AmiId,
            InstanceInitiatedShutdownBehavior: "terminate",
            InstanceMarketOptions: {},
            InstanceType: this.config.ec2InstanceType,
            MaxCount: 1,
            MinCount: 1,
            SecurityGroupIds: [
                this.config.ec2SecurityGroupId
            ],
            SubnetId: this.config.ec2SubnetId,
            TagSpecifications: [
                {
                    ResourceType: "instance",
                    Tags: this.tags
                }
            ],
            UserData: (await userData.getUserData())
        };


        switch (this.config.ec2SpotInstanceStrategy) {
            case 'SpotOnly': {
                params.InstanceMarketOptions = {
                    MarketType: "spot",
                    SpotOptions: {
                        InstanceInterruptionBehavior: "terminate",
                        MaxPrice: `${await this.getSpotInstancePrice(this.config.ec2InstanceType)}`,
                        SpotInstanceType: "one-time"
                    }
                };
                break;
            }
            case 'BestEffort': {
                const spotInstanceTypePrice = await this.getSpotInstancePrice(this.config.ec2InstanceType)
                if (currentInstanceTypePrice && currentInstanceTypePrice && (spotInstanceTypePrice < currentInstanceTypePrice))
                    params.InstanceMarketOptions = {
                        MarketType: "spot",
                        SpotOptions: {
                            InstanceInterruptionBehavior: "terminate",
                            MaxPrice: `${currentInstanceTypePrice}`,
                            SpotInstanceType: "one-time"
                        }
                    };
                break;
            }
            case 'MaxPerformance': {
                params.InstanceType = await this.bestSpotSizeForOnDemandPrice(this.config.ec2InstanceType);
                params.InstanceMarketOptions = {
                    MarketType: "spot",
                    SpotOptions: {
                        InstanceInterruptionBehavior: "terminate",
                        MaxPrice: `${await this.getSpotInstancePrice(this.config.ec2InstanceType)}`,
                        SpotInstanceType: "one-time"
                    }
                };
                break;
            }
            default: {
                params.InstanceMarketOptions = {};
                break;
            }
        }

        this.runInstances(params)
    }


    //  this.client.describeInstanceTypeOfferings  
    /*
    async getOndemandPrice(instanceType: string) {
        const ServiceCode = "AmazonEC2";
        const params = {
            Filters: [
                {
                    'Type': 'TERM_MATCH',
                    'Field': 'location',
                    'Value': await this.getSubnetAz()
                },
                {
                    'Type': 'TERM_MATCH',
                    'Field': 'instanceType',
                    'Value': instanceType
                }
            ]
        };


        return new Promise<AWS.Pricing.PriceList>((resolve, reject) => {
            this.pricingClient.getProducts(params, (err, data) => {
                if (err) {
                    return reject(err);
                }
                //if (data.Subnets?.length && data.Subnets?.length > 0)
                //if (data.SpotPriceHistory?.length == 1 && data.SpotPriceHistory[0].SpotPrice)
                console.log(JSON.stringify(data))
                    if (data.PriceList)
                    resolve(data.PriceList);
            });
        });
    }*/


}