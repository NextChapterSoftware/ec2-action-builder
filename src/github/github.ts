import { ConfigInterface } from "../config/config";
import * as github from "@actions/github";
import * as _ from "lodash";
import * as core from "@actions/core";

export class GithubClient {
  config: ConfigInterface;

  constructor(config: ConfigInterface) {
    this.config = config;
  }

  async getRunnerVersion(): Promise<string> {
    if (this.config.githubActionRunnerVersion)
      return this.config.githubActionRunnerVersion.replace("v", "");

    const octokit = github.getOctokit(this.config.githubToken);
    const resp = await octokit.rest.repos.getLatestRelease({
      owner: "actions",
      repo: "runner",
    });
    return resp.data.tag_name.replace("v", "");
  }

  async getRunnerWithLabels(labels: string[]) {
    const octokit = github.getOctokit(this.config.githubToken);

    try {
      const runners = await octokit.rest.actions.listSelfHostedRunnersForRepo({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
      });

      const searchLabels = {
        labels: labels.map(function (label) {
          return { name: label };
        }),
      };

      const matches = _.filter(runners.data.runners, searchLabels);
      return matches.length > 0 ? matches[0] : null;
    } catch (error) {
      core.warning(`Failed to list github runners: ${error}`);
    }

    return null;
  }

  async getRunnerRegistrationToken() {
    const octokit = github.getOctokit(this.config.githubToken);
    try {
      const response =
        await octokit.rest.actions.createRegistrationTokenForRepo({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
        });

      return response.data;
    } catch (error) {
      core.error(`Failed to get Runner registration token: ${error}`);
      throw error;
    }
  }

  async removeRunnerWithLabels(labels: string[]) {
    try {
      const runner = await this.getRunnerWithLabels(labels);
      if (runner) {
        const octokit = github.getOctokit(this.config.githubToken);
        const response =
          await octokit.rest.actions.deleteSelfHostedRunnerFromRepo({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            runner_id: runner.id,
          });
        return response.status == 204;
      }
    } catch (error) {
      core.error(`Failed to delete runner: ${error}`);
    }
    return true;
  }

  // Borrowed from https://github.com/machulav/ec2-github-runner/blob/main/src/aws.js
  async pollForRunnerCreation(labels: string[]) {
    const timeoutMinutes = 5;
    const retryIntervalSeconds = this.config.githubApiRetryDelay;
    const quietPeriodSeconds = 30;
    let waitSeconds = 0;

    core.info(`Waiting ${quietPeriodSeconds}s before polling for runner`);
    await new Promise((r) => setTimeout(r, quietPeriodSeconds * 1000));
    core.info(`Polling for runner every ${retryIntervalSeconds}s`);

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunnerWithLabels(labels);

        if (waitSeconds > timeoutMinutes * 60) {
          core.error("GitHub self-hosted runner creation error");
          clearInterval(interval);
          reject(
            `A timeout of ${timeoutMinutes} minutes is exceeded. Please ensure your EC2 instance has access to the Internet.`
          );
        }

        if (runner && runner.status === "online") {
          core.info(
            `GitHub self-hosted runner ${runner.name} is created and ready to use`
          );
          clearInterval(interval);
          resolve(true);
        } else {
          waitSeconds += retryIntervalSeconds;
          core.info("Waiting...");
        }
      }, retryIntervalSeconds * 1000);
    });
  }
}
