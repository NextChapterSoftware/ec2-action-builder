import AWS from 'aws-sdk';
import { ConfigInterface } from '../config/config';
import { findValuesHelper } from '../utils/utils';

interface OnDemandPricing {
    instanceType: string;
    price: number;
}

export class Ec2Pricing {
    config: ConfigInterface;
    client: AWS.Pricing;

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
        this.client = new AWS.Pricing({
            credentials: this.credentials,
            region: 'us-east-1'
        });
    }

    // Not used
    describeServices() {

        var params = {
            FormatVersion: "aws_v1",
            MaxResults: 1,
            ServiceCode: "AmazonEC2"
        };


        return new Promise<AWS.Pricing.ServiceList>((resolve, reject) => {
            this.client.describeServices(params, (err, data) => {
                if (err) {
                    return reject(err);
                }
                if (data.Services)
                    resolve(data.Services);
                else
                    reject([])
            });
        });
    }

    // TODO: Add unblocked note with sample payload
    getPriceForInstanceTypeUSD(instanceType: string) {

        var params = {
            Filters: [
                {
                    Type: "TERM_MATCH",
                    Field: "ServiceCode",
                    Value: "AmazonEC2"
                },
                {
                    Type: "TERM_MATCH",
                    Field: "regionCode",
                    Value: this.config.awsRegion
                },
                {
                    Type: "TERM_MATCH",
                    Field: "marketoption",
                    Value: "OnDemand"
                },
                {
                    Type: "TERM_MATCH",
                    Field: "instanceType",
                    Value: instanceType
                },
                {
                    Type: "TERM_MATCH",
                    Field: "operatingSystem",
                    Value: "Linux"
                },
                {
                    Type: "TERM_MATCH",
                    Field: "licenseModel",
                    Value: "No License required"
                },
                {
                    Type: "TERM_MATCH",
                    Field: "preInstalledSw",
                    Value: "NA"
                }

            ],
            FormatVersion: "aws_v1",
            MaxResults: 99,
            ServiceCode: "AmazonEC2"
        };

        return new Promise<number>((resolve, reject) => {
            this.client.getProducts(params, (err, data) => {
                if (err) {
                    return reject(err);
                }

                if (data.PriceList) {
                    let searchResult = findValuesHelper(data.PriceList[0]["terms"]["OnDemand"], "USD")
                    resolve(Number(searchResult[0]));

                } else
                   resolve(0)
            });
        });
    }
}

