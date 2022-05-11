
import { ConfigInterface } from "../config/config";
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import * as github from '@actions/github'
import { GithubClient } from "../github/github";


export class UserData {
    config: ConfigInterface;    

    constructor(config: ConfigInterface) {
        this.config = config
    }

    async getUserData(): Promise<string>{

        const ghClient = new GithubClient(this.config)
        const githubActionRunnerVersion = await ghClient.getRunnerVersion()
        const runnerRegistrationToken = await ghClient.getRunnerRegistrationToken()
        
        const cmds = [
            '#!/bin/bash',
            `shutdown -p +${this.config.ec2InstanceTtl}`,
            'mkdir actions-runner && cd actions-runner',
            `GH_RUNNER_VERSION=${githubActionRunnerVersion}`,
            'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
            'curl -O -L https://github.com/actions/runner/releases/download/v${GH_RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-2.${GH_RUNNER_VERSION}.tar.gz',                        
            'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.${GH_RUNNER_VERSION}.tar.gz',
            'export RUNNER_ALLOW_RUNASROOT=1',
            `./config.sh --ephemeral --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token ${runnerRegistrationToken} --labels ${this.config.githubActionRunnerLabel}`,
            './run.sh',
          ];
          
          return Buffer.from(cmds.join('\n')).toString('base64');
    }
}
