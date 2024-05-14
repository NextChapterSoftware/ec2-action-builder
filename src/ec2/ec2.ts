import { ConfigInterface } from "../config/config";
import * as _ from "lodash";
import { AwsCredentialIdentity } from "@smithy/types";
import { EC2, waitUntilInstanceRunning, DescribeSpotPriceHistoryCommandInput, _InstanceType, RunInstancesCommandInput } from "@aws-sdk/client-ec2";
import { STS } from "@aws-sdk/client-sts";
import * as core from "@actions/core";
import { UserData } from "./userdata";
import { Ec2Pricing } from "./pricing";

interface Tag {
  Key: string;
  Value: string;
}

interface InstanceTypeInterface {
  name: string;
  vcpu: number;
}

interface FilterInterface {
  Name: string;
  Values: string[];
}

export class Ec2Instance {
  config: ConfigInterface;
  client: EC2;
  tags: Tag[];
  credentials: AwsCredentialIdentity;
  assumedRole: boolean = false;

  constructor(config: ConfigInterface) {
    this.config = config;
    this.credentials = {
      accessKeyId: this.config.awsAccessKeyId,
      secretAccessKey: this.config.awsSecretAccessKey,
      sessionToken: this.config.awsSessionToken,
    };

    this.client = new EC2({
      credentials: this.credentials,
      region: this.config.awsRegion,
    });

    this.tags = this.getTags();
  }

  async getEc2Client() {
    if (!this.assumedRole && this.config.awsAssumeRole) {
      this.assumedRole = !this.assumedRole;
      const credentials = await this.getCrossAccountCredentials();
      this.client = new EC2({
        credentials: credentials,
        region: this.config.awsRegion,
      });
    }
    return this.client;
  }

  getTags() {
    // Parse custom tags
    let customTags = []
    if (this.config.ec2InstanceTags) {
      customTags = JSON.parse(this.config.ec2InstanceTags);
    }

    return [
      {
        Key: "Name",
        Value: `${this.config.githubRepo}-${this.config.githubJobId}`,
      },
      {
        Key: "github_ref",
        Value: this.config.githubRef,
      },
      {
        Key: "owner",
        Value: "EC2_ACTION_BUILDER",
      },
      {
        Key: "github_job_id",
        Value: this.config.githubJobId,
      },
      {
        Key: "github_repo",
        Value: this.config.githubRepo,
      },
      ...customTags
    ];
  }

  async getCrossAccountCredentials(): Promise<AwsCredentialIdentity> {
    // if we have a valid session token then we just pass the credentials through
    // possibly this is due to an OIDC/OAuth flow
    if (
        typeof this.credentials.sessionToken == "string" &&
        this.credentials.sessionToken != ""
    ) {
      return Object.assign(this.credentials);
    }

    const stsClient = new STS({
      credentials: this.credentials,
      region: this.config.awsRegion,
    });

    const timestamp = new Date().getTime();
    const params = {
      RoleArn: this.config.awsIamRoleArn,
      RoleSessionName: `ec2-action-builder-${this.config.githubJobId}-${timestamp}`,
    };
    try {
      const data = await stsClient.assumeRole(params);
      if (data.Credentials && data.Credentials.AccessKeyId && data.Credentials.SecretAccessKey)
        return {
          accessKeyId: data.Credentials.AccessKeyId,
          secretAccessKey: data.Credentials.SecretAccessKey,
          sessionToken: data.Credentials.SessionToken,
        };

      core.error(`STS returned empty response`);
      throw Error("STS returned empty response");
    } catch (error) {
      core.error(`STS assume role failed`);
      throw error;
    }
  }

  async runInstances(params: RunInstancesCommandInput) {
    const client = await this.getEc2Client();

    try {
      return (await client.runInstances(params)).Instances;
    } catch (error) {
      core.error(`Failed to create instance(s)`);
      throw error;
    }
  }

  async getSubnetAz() {
    const client = await this.getEc2Client();
    try {
      const subnets = (
        await client
          .describeSubnets({
            SubnetIds: [this.config.ec2SubnetId],
          })
      ).Subnets;
      return subnets?.at(0)?.AvailabilityZone;
    } catch (error) {
      core.error(`Failed to lookup subnet az`);
      throw error;
    }
  }

  async getSpotInstancePrice(instanceType: string) {
    const client = await this.getEc2Client();
    const params: DescribeSpotPriceHistoryCommandInput = {
      AvailabilityZone: await this.getSubnetAz(),
      //EndTime: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789,
      InstanceTypes: [
        (instanceType ? instanceType : this.config.ec2InstanceType) as _InstanceType,
      ],
      ProductDescriptions: [
        "Linux/UNIX",
        // 'Red Hat Enterprise Linux'
        // 'SUSE Linux'
        // 'Windows'
      ],
      StartTime: new Date(),
    };

    try {
      const spotPriceHistory = (
        await client.describeSpotPriceHistory(params)
      ).SpotPriceHistory;

      return Number(spotPriceHistory?.at(0)?.SpotPrice);
    } catch (error) {
      core.error(`Failed to lookup spot instance price`);
      throw error;
    }
  }

  async getInstanceSizesForType(
    instanceClass: string,
    includeBareMetal: boolean = false
  ) {
    const client = await this.getEc2Client();
    var params = {
      Filters: [
        {
          Name: "instance-type",
          Values: [`${instanceClass}.*`],
        },
        {
          Name: "bare-metal",
          Values: [`${includeBareMetal}`],
        },
      ],
      MaxResults: 99,
    };

    var instanceTypesList: InstanceTypeInterface[] = [];
    var nextToken: string = "";
    do {
      const response = await client.describeInstanceTypes(params);
      response.InstanceTypes?.forEach(function (item) {
        if (item.InstanceType && item.VCpuInfo?.DefaultCores)
          instanceTypesList.push({
            name: item.InstanceType,
            vcpu: item.VCpuInfo?.DefaultCores,
          });
      });

      nextToken = response.NextToken ? response.NextToken : "";
      params = { ...params, ...{ NextToken: nextToken } };
    } while (nextToken);

    return _.orderBy(instanceTypesList, "vcpu");
  }

  async getNextLargerInstanceType(instanceType: string) {
    const instanceClass = instanceType.toLowerCase().split(".")[0];
    var instanceTypeList = await this.getInstanceSizesForType(instanceClass);
    instanceTypeList = instanceTypeList.filter(function (item) {
      return !item.name.includes("metal");
    });

    const currentInstanceTypeIndex = instanceTypeList
      .map(function (e) {
        return e.name;
      })
      .indexOf(instanceType);
    const nextInstanceTypeIndex =
      currentInstanceTypeIndex + 1 < instanceTypeList.length
        ? currentInstanceTypeIndex + 1
        : currentInstanceTypeIndex;
    return instanceTypeList[nextInstanceTypeIndex].name;
  }

  async bestSpotSizeForOnDemandPrice(instanceType: string) {
    const ec2Pricing = new Ec2Pricing(this.config);
    const currentOnDemandPrice = await ec2Pricing.getPriceForInstanceTypeUSD(
      instanceType ? instanceType : this.config.ec2InstanceType
    );
    var previousInstanceType = this.config.ec2InstanceType;
    var bestInstanceType = this.config.ec2InstanceType;
    do {
      const nextLargerInstance = await this.getNextLargerInstanceType(
        bestInstanceType
      );
      const spotPriceForLargerInstance = await this.getSpotInstancePrice(
        nextLargerInstance
      );

      previousInstanceType = bestInstanceType;
      if (
        spotPriceForLargerInstance > 0 &&
        currentOnDemandPrice > spotPriceForLargerInstance
      ) {
        bestInstanceType = nextLargerInstance;
      }
    } while (bestInstanceType != previousInstanceType);

    return bestInstanceType;
  }

  async getInstanceConfiguration(ec2SpotInstanceStrategy: string) {
    const ec2Pricing = new Ec2Pricing(this.config);
    const currentInstanceTypePrice =
      await ec2Pricing.getPriceForInstanceTypeUSD(this.config.ec2InstanceType);

    const userData = new UserData(this.config);

    var params: RunInstancesCommandInput = {
      ImageId: this.config.ec2AmiId,
      InstanceInitiatedShutdownBehavior: "terminate",
      InstanceMarketOptions: {},
      InstanceType: this.config.ec2InstanceType as _InstanceType,
      MaxCount: 1,
      MinCount: 1,
      SecurityGroupIds: [this.config.ec2SecurityGroupId],
      SubnetId: this.config.ec2SubnetId,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: this.tags,
        },
      ],
      UserData: await userData.getUserData(),
    };

    switch (ec2SpotInstanceStrategy.toLowerCase()) {
      case "spotonly": {
        params.InstanceMarketOptions = {
          MarketType: "spot",
          SpotOptions: {
            InstanceInterruptionBehavior: "terminate",
            MaxPrice: `${await this.getSpotInstancePrice(
              this.config.ec2InstanceType
            )}`,
            SpotInstanceType: "one-time",
          },
        };
        break;
      }
      case "besteffort": {
        const spotInstanceTypePrice = await this.getSpotInstancePrice(
          this.config.ec2InstanceType
        );
        if (
          currentInstanceTypePrice &&
          spotInstanceTypePrice < currentInstanceTypePrice
        )
          params.InstanceMarketOptions = {
            MarketType: "spot",
            SpotOptions: {
              InstanceInterruptionBehavior: "terminate",
              MaxPrice: `${currentInstanceTypePrice}`,
              SpotInstanceType: "one-time",
            },
          };
        break;
      }
      case "maxperformance": {
        params.InstanceType = await this.bestSpotSizeForOnDemandPrice(
          this.config.ec2InstanceType
        ) as _InstanceType;
        params.InstanceMarketOptions = {
          MarketType: "spot",
          SpotOptions: {
            InstanceInterruptionBehavior: "terminate",
            MaxPrice: currentInstanceTypePrice.toString(),
            SpotInstanceType: "one-time",
          },
        };
        break;
      }
      case "none": {
        params.InstanceMarketOptions = {};
        break;
      }
      default: {
        throw new TypeError("Invalid value for ec2_spot_instance_strategy");
      }
    }

    return params;
  }

  async getInstanceStatus(instanceId: string) {
    const client = await this.getEc2Client();
    try {
      const instanceList = (
        await client
          .describeInstanceStatus({ InstanceIds: [instanceId] })
      ).InstanceStatuses;
      return instanceList?.at(0);
    } catch (error) {
      core.error(`Failed to lookup status for instance ${instanceId}`);
      throw error;
    }
  }

  async getInstancesForTags() {
    const client = await this.getEc2Client();
    const filters: FilterInterface[] = [];
    for (const tag of this.tags) {
      filters.push({
        Name: tag.Key,
        Values: [tag.Value],
      });
    }
    try {
      var params = {
        Filters: filters,
        MaxResults: 99,
      };

      const reservation = (
        await client.describeInstances(params)
      ).Reservations?.at(0);
      return reservation?.Instances?.at(0);
    } catch (error) {
      core.error(`Failed to lookup status for instance for tags ${filters}`);
      throw error;
    }
  }

  async waitForInstanceRunningStatus(instanceId: string) {
    const client = await this.getEc2Client();
    try {
      await waitUntilInstanceRunning({
        client,
        maxWaitTime: 200,
      }, { InstanceIds: [instanceId] });
      core.info(`AWS EC2 instance ${instanceId} is up and running`);
      return;
    } catch (error) {
      core.error(`AWS EC2 instance ${instanceId} init error`);
      throw error;
    }
  }

  async terminateInstances(instanceId: string) {
    const client = await this.getEc2Client();
    try {
      await client.terminateInstances({ InstanceIds: [instanceId] });
      core.info(`AWS EC2 instance ${instanceId} is terminated`);
      return;
    } catch (error) {
      core.error(`Failed terminate instance ${instanceId}`);
      throw error;
    }
  }
}
