import { expect } from 'chai';
import { GithubClient } from '../../src/github/github';
import { ActionConfig } from '../../src/config/config';

describe('Github API tests', () => {
    const config = new ActionConfig()
    const githubClient = new GithubClient(config);

    it('get latest runner release version', async () => {
        const version = await githubClient.getRunnerVersion()
        expect(version).is.string;
        expect(version.length).to.greaterThan(0);
    });

    it('list runners with labels for repo', async () => {
        const runners = await githubClient.getRunnerWithLabels(["self-hosted", "Linux"])
        expect(runners).not.throw
    });


    it('get jit runner registration config for repo', async () => {
        const jitConfig = await githubClient.getJITRunnerRegistrationConfig();
        expect(jitConfig.encoded_jit_config).is.not.undefined;
        expect(jitConfig.encoded_jit_config.length).to.greaterThan(0);
        const runners = await githubClient.getRunnerWithLabels([config.githubActionRunnerLabel])
        expect(runners).not.throw
        expect(runners).is.not.empty
        expect(runners).is.not.equal(null)
    });

    it('remove runners with labels for repo', async () => {
        let runners = await githubClient.removeRunnerWithLabels(["foo", "bar"])
        expect(runners).is.true

        // Check if runner exists before removing
        runners = await githubClient.getRunnerWithLabels([config.githubActionRunnerLabel])
        expect(runners).not.throw
        expect(runners).is.not.empty
        expect(runners).is.not.equal(null)

        // Remove runner
        const result = await githubClient.removeRunnerWithLabels([config.githubActionRunnerLabel])
        expect(result).is.true

        // Check if runner has been deleted
        runners = await githubClient.getRunnerWithLabels([config.githubActionRunnerLabel])
        expect(runners).not.throw
        expect(runners).is.equal(null)

    });

});