
import { Config, ConfigInterface } from "../config/config";
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import * as github from '@actions/github'
import { GithubClient } from "../github/github";


export class UserData {
    config: Config;    

    constructor(config: ConfigInterface) {
        this.config = config
        
    }

    async getRunnerVersion(): Promise<string> {
        if (this.config.githubActionRunnerVersion) 
            return this.config.githubActionRunnerVersion.replace("v",'')

        const httpClient = new HttpClient("http-client")
        const res: HttpClientResponse = await httpClient.get(
            'https://api.github.com/repos/actions/runner/releases/latest'
        )

        const body: string = await res.readBody()
        const obj = JSON.parse(body)
        return obj["tag_name"].replace("v",'')
    }

    async getUserData(): Promise<string>{

        const ghClient = new GithubClient(this.config)
        const runnerRegistrationToken = await ghClient.getRunnerRegistrationToken()
        
        const githubActionRunnerVersion = await this.getRunnerVersion()
        github.context.repo.owner
        const cmds = [
            '#!/bin/bash',
            'mkdir actions-runner && cd actions-runner',
            `GH_RUNNER_VERSION=${githubActionRunnerVersion}`,
            'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
            'curl -O -L https://github.com/actions/runner/releases/download/v${GH_RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-2.${GH_RUNNER_VERSION}.tar.gz',                        
            'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.${GH_RUNNER_VERSION}.tar.gz',
            'export RUNNER_ALLOW_RUNASROOT=1',
            `./config.sh --url https://github.com/${github.context.repo.owner}/${github.context.repo.repo} --token ${runnerRegistrationToken} --labels ${this.config.githubActionRunnerLabel}`,
            './run.sh',
          ];
          
          return Buffer.from(cmds.join('\n')).toString('base64');
    }


}
