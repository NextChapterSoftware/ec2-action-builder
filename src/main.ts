import { ActionConfig } from "./libs/config/config";
import { Ec2Instance } from "./libs/ec2/ec2";

import * as core from "@actions/core";
import { GithubClient } from "./libs/github/github";
import { assertIsError } from "./libs/utils/utils";

function setOutput(label, ec2InstanceId) {
  core.setOutput("label", label);
  core.setOutput("ec2-instance-id", ec2InstanceId);
}

async function start() {
  const config = new ActionConfig();
  const ec2Client = new Ec2Instance(config);
  const ghClient = new GithubClient(config);

  // Get instance config
  const instanceConfig = await ec2Client.getInstanceConfiguration();

  // Start instance
  const instanceId = (await ec2Client.runInstances(instanceConfig))?.at(
    0
  )?.InstanceId;
  //instances.at(0)?.InstanceId
  //setOutput(label, ec2InstanceId);
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
  const config = new ActionConfig();
  const ec2Client = new Ec2Instance(config);
  const ghClient = new GithubClient(config);
  const instanceId = await ec2Client.getInstancesForTags();
  if (instanceId?.InstanceId)
    await ec2Client.terminateInstances(instanceId?.InstanceId);
  await ghClient.removeRunnerWithLabels([config.githubJobId]);
}

(async function () {
  try {
    start();
  } catch (error) {
    assertIsError(error);
    core.error(error);
    core.setFailed(error.message);
  }
})();
