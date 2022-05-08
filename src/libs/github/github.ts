//https://api.github.com/repos/actions/runner/releases/latest

import { Config, ConfigInterface } from "../config/config";
import * as github from '@actions/github'
import * as _ from "lodash"
import * as core from '@actions/core';


export class GithubClient {
    config: ConfigInterface;

    constructor(config: ConfigInterface) {
        this.config = config
    }

    async getRunnerWithLabels(labels: string[]) {
        const octokit = github.getOctokit(this.config.githubToken);
        var done = false
        do {

            try {
                const runners = await octokit.rest.actions.listSelfHostedRunnersForRepo({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                });
                done = !Boolean(runners.data.total_count);

                const searchLabels = {
                    labels: labels.map(function (label) {
                        return { name: label };
                    })
                };

                //const mockRunnerData = {"total_count":2,"runners":[{"id":319,"name":"ip-192-168-0-139","os":"Linux","status":"online","busy":true,"labels":[{"id":297,"name":"self-hosted","type":"read-only"},{"id":298,"name":"Linux","type":"read-only"},{"id":299,"name":"X64","type":"read-only"},{"id":314,"name":"dow0w","type":"custom"}]},{"id":320,"name":"ip-192-168-11-102","os":"Linux","status":"online","busy":true,"labels":[{"id":297,"name":"self-hosted","type":"read-only"},{"id":298,"name":"Linux","type":"read-only"},{"id":299,"name":"X64","type":"read-only"},{"id":315,"name":"2pdrq","type":"custom"}]}]}
                const matches = _.filter(runners.data.runners, searchLabels);
                return matches.length > 0 ? matches[0] : null;

            } catch (error) {
                throw error;
            }

        } while (done);
        return null;
    }

    async getRunnerRegistrationToken() {
        const octokit = github.getOctokit(this.config.githubToken)
        try {
            const response = await octokit.rest.actions.createRegistrationTokenForRepo({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
            });

            return response.data
        } catch (error) {
            core.error(`Failed to get Runner registration token: ${error}`);
            throw error;
        }

    }

    async removeRunnerWithLabels(labels: string[]) {
        try {
            const runner = await this.getRunnerWithLabels(labels)
            if (runner) {
                const octokit = github.getOctokit(this.config.githubToken)
                const response = await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    runner_id: runner.id
                });
                return (response.status == 204);
            }
        } catch (error) {
            core.error(`Failed to get Runner registration token: ${error}`);
            throw error;
        }
        return true;
    }

}
