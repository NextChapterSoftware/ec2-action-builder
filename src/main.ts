import { ActionConfig } from "./config/config";
import { Ec2Instance } from "./ec2/ec2";
import * as core from "@actions/core";
import { GithubClient } from "./github/github";
import { assertIsError } from "./utils/utils";

function setOutput(label, ec2InstanceId) {
  core.setOutput("label", label);
  core.setOutput("ec2-instance-id", ec2InstanceId);
}

async function start() {
  const config = new ActionConfig();
  const ec2Client = new Ec2Instance(config);
  const ghClient = new GithubClient(config);


  var ec2SpotStrategies: string[];
  switch (config.ec2SpotInstanceStrategy) {
    case "maxperformance": {
      ec2SpotStrategies = ["MaxPerformance", "SpotOnly"]
      core.info("Ec2 spot instance strategy is set to 'MaxPerformance' with 'SpotOnly' and 'None' as fallback");
      break;
    }
    case "besteffort": {
      ec2SpotStrategies = ["BestEffort", "none"]
      core.info("Ec2 spot instance strategy is set to 'BestEffort' with 'None' as fallback");
      break;
    }
    default: {
      ec2SpotStrategies = [config.ec2SpotInstanceStrategy]
      core.info(`Ec2 spot instance strategy is set to ${config.ec2SpotInstanceStrategy}`);
    }
  }

  var instanceId = "";
  for (const ec2Strategy of ec2SpotStrategies) {
    core.info(`Starting instance with ${ec2Strategy} strategy`);
    // Get instance config
    const instanceConfig = await ec2Client.getInstanceConfiguration(ec2Strategy);
    try {
      // Start instance
      const response = (await ec2Client.runInstances(instanceConfig))
      if (response?.length && response.length > 0 && response[0].InstanceId) {
        instanceId = response[0].InstanceId
        break;
      }
    } catch (error) {
      if (error?.code && error.code === "InsufficientInstanceCapacity" && ec2SpotStrategies.length > 0 && ec2Strategy.toLocaleUpperCase() != "none")
        core.info("Failed to create instance due to 'InsufficientInstanceCapacity', trying fallback strategy next");
      else
        throw error;
    }
  }

  if (instanceId) await ec2Client.waitForInstanceRunningStatus(instanceId);
  else {
    core.error("Failed to get ID of running instance");
    throw Error("Failed to get ID of running instance");
  }

  if (instanceId) await ghClient.pollForRunnerCreation([config.githubJobId]);
  else {
    core.error("Instance failed to register with Github Actions");
    throw Error("Instance failed to register with Github Actions");
  }
}

async function stop() {
  try {
    core.info("Starting instance cleanup");
    const config = new ActionConfig();
    const ec2Client = new Ec2Instance(config);
    const ghClient = new GithubClient(config);

    // Following cleanup tasks are best-effort!
    // Unused JIT runners will be automatically removed by GitHub
    // EC2 instances are configured with a hard TTL and will terminate once TTL expires

    // Try to remove runner
    const deleted = await ghClient.removeRunnerWithLabels([config.githubActionRunnerLabel])
    if(deleted){
      core.info(`Removed runner with job id label ${config.githubActionRunnerLabel}`);
    } else {
      core.error(`Failed to clean up runner with job id label ${config.githubActionRunnerLabel}`);
      core.info(`GitHub will automatically cleanup unused runners after sometime`);
    }

    // Try to remove EC2 instance
    const instanceId = await ec2Client.getInstancesForTags();
    if (instanceId?.InstanceId)
      await ec2Client.terminateInstances(instanceId?.InstanceId);
    const result = await ghClient.removeRunnerWithLabels([config.githubJobId]);
    if(result) {
      core.info("Finished instance cleanup");
    } else {
      core.error("Failed to terminate ec2 instance. It will be automatically terminated once its TTL expires")
    }
  } catch(error){
    core.info(error)
  }
}

(async function () {
  try {
    start();
  } catch (error) {
    stop()
    assertIsError(error);
    core.error(error);
    core.setFailed(error.message);
  }
})();
