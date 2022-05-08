import { expect } from 'chai';
import { GithubClient } from '../../src/libs/github/github';
import { genMockConfig } from '../../src/libs/mockConfig';


describe('Options tests', () => { 
    const mockConfig = genMockConfig();
    const githubClient = new GithubClient(mockConfig);
/*
    it('list runners with labels for repo', async () => { 
        const runners = await githubClient.getRunnerWithLabels(["self-hosted", "Linux"])
        console.log(runners)     
    });

    it('get runner registration token for repo', async () => { 
        const token = await githubClient.getRunnerRegistrationToken()
        expect(token.token).is.not.undefined;
        expect(token.token.length).to.greaterThan(0);
        expect(token.expires_at).is.not.undefined;
        expect(token.expires_at.length).to.greaterThan(0);
    });

    it('list runners with labels for repo', async () => { 
        const runners = await githubClient.removeRunnerWithLabels(["foo", "bar"])
        console.log(runners)     
    });*/

});