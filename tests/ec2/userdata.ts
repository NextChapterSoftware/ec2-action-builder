import { expect } from 'chai';
import { UserData } from '../../src/ec2/userdata';
import { ActionConfig } from '../../src/config/config';
const decode = (str: string):string => Buffer.from(str, 'base64').toString('binary');

describe('Userdata tests', () => {     
    const config = new ActionConfig()

    it('get latest runner release version', async () => {
        const userData = new UserData(config);
        const userdata = await userData.getUserData()        
        expect(userdata).is.string;
        expect(userdata.length).to.greaterThan(0);        
    });

    it('check idle timeout ttl', async () => {
        config.githubJobStartTtlSeconds="0"
        var userData = new UserData(config)
        var userdataB64 = await userData.getUserData()
        expect(userdataB64).is.string;
        expect(decode(userdataB64)).not.includes("timeout=");

        config.githubJobStartTtlSeconds="invalidValue"
        userData = new UserData(config)
        userdataB64 = await userData.getUserData()
        expect(decode(userdataB64)).not.includes("timeout=");

        config.githubJobStartTtlSeconds="20"
        userData = new UserData(config)
        userdataB64 = await userData.getUserData()
        expect(decode(userdataB64)).includes("timeout=");

    });
});