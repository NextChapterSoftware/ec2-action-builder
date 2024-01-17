import { ConfigInterface } from "../config/config";
import * as github from "@actions/github";
import { HttpClient, HttpClientResponse } from "@actions/http-client";
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

    const httpClient = new HttpClient("http-client");
    const res: HttpClientResponse = await httpClient.get(
      "https://api.github.com/repos/actions/runner/releases/latest"
    );

    const body: string = await res.readBody();
    const obj = JSON.parse(body);
    return obj["tag_name"].replace("v", "");
  }

  async getRunnerWithLabels(labels: string[]) {
    const octokit = github.getOctokit(this.config.githubToken);
    var done = false;
    do {
      try {
        const runners = await octokit.rest.actions.listSelfHostedRunnersForRepo(
          {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
          }
        );
        done = !Boolean(runners.data.total_count);

        const searchLabels = {
          labels: labels.map(function (label) {
            return { name: label };
          }),
        };

        const matches = _.filter(runners.data.runners, searchLabels);
        return matches.length > 0 ? matches[0] : null;
      } catch (error) {
        core.error(`Failed to list github runners: ${error}`);
        throw error;
      }
    } while (done);
    return null;
  }

  async getJITRunnerRegistrationConfig() {
    const octokit = github.getOctokit(this.config.githubToken);
    try {
      this.config.githubActionRunnerLabel
      const response =
          await octokit.rest.actions.generateRunnerJitconfigForRepo({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            name: `${this.config.githubRepo}-${this.config.githubJobId}-${github.context.actor}`,
            runner_group_id: 1,
            labels: [
              'self-hosted',
              this.config.githubActionRunnerLabel,
              github.context.actor
            ],
            work_folder: '_work',
            /*headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }*/
          })

      return response.data;
    } catch (error) {
      core.error(`Failed to get just-in-time runner registration config: ${error}`);
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

  async waitForRunnerCreated(label) {
    const timeoutMinutes = 5;
    const retryIntervalSeconds = 10;
    const quietPeriodSeconds = 30;
    let waitSeconds = 0;

    core.info(`Waiting ${quietPeriodSeconds}s before polling for runner`);
    await new Promise((r) => setTimeout(r, quietPeriodSeconds * 1000));
    core.info(`Polling for runner every ${retryIntervalSeconds}s`);

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const runner = await this.getRunnerWithLabels(label);

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
          resolve("online");
        } else {
          waitSeconds += retryIntervalSeconds;
          core.info("Waiting...");
        }
      }, retryIntervalSeconds * 1000);
    });
  }

  // Borrowed from https://github.com/machulav/ec2-github-runner/blob/main/src/aws.js
  async pollForRunnerCreation(labels: string[]) {
    const timeoutMinutes = 5;
    const retryIntervalSeconds = 10;
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
