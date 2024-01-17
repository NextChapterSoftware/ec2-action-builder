import { ConfigInterface } from "../config/config";
import * as github from "@actions/github";
import { GithubClient } from "../github/github";

export class UserData {
  config: ConfigInterface;

  constructor(config: ConfigInterface) {
    this.config = config;
  }

  async getUserData(): Promise<string> {
    const ghClient = new GithubClient(this.config);
    const githubActionRunnerVersion = await ghClient.getRunnerVersion();
    const jitRunnerRegistrationConfig = await ghClient.getJITRunnerRegistrationConfig();
    if (!this.config.githubActionRunnerLabel)
      throw Error("failed to object job ID for label");

    const cmds = [
      "#!/bin/bash",
      `shutdown -P +${this.config.ec2InstanceTtl}`,
      "CURRENT_PATH=$(pwd)",
      `echo "shutdown -P +1" > $CURRENT_PATH/shutdown_script.sh`,
      "chmod +x $CURRENT_PATH/shutdown_script.sh",
      "export ACTIONS_RUNNER_HOOK_JOB_COMPLETED=$CURRENT_PATH/shutdown_script.sh",
      "mkdir -p actions-runner && cd actions-runner",
      'echo "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=$CURRENT_PATH/shutdown_script.sh" > .env',
      `GH_RUNNER_VERSION=${githubActionRunnerVersion}`,
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      "curl -O -L https://github.com/actions/runner/releases/download/v${GH_RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${GH_RUNNER_VERSION}.tar.gz",
      "tar xzf ./actions-runner-linux-${RUNNER_ARCH}-${GH_RUNNER_VERSION}.tar.gz",
      "export RUNNER_ALLOW_RUNASROOT=1",
      `RUNNER_NAME=${this.config.githubJobId}-$(hostname)-ec2`,
      "[ -n \"$(command -v yum)\" ] && yum install libicu -y",
      `./run.sh --jitconfig ${jitRunnerRegistrationConfig.encoded_jit_config}`,
    ];

    return Buffer.from(cmds.join("\n")).toString("base64");
  }
}
