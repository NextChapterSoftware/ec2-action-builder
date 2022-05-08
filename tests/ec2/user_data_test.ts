import { expect } from 'chai';
import { UserData } from '../../src/libs/ec2/userdata';
import { genMockConfig } from '../../src/libs/mockConfig';


describe('Options tests', () => { 
    const mockConfig = genMockConfig();
    const userData = new UserData(mockConfig);

   /* it('get latest runner release version', async () => { 
        const version = await userData.getRunnerVersion()
        expect(version).is.string;
        expect(version.length).to.greaterThan(0);        
    });

    it('get latest runner release version', async () => { 
        const userdata = await userData.getUserData()        
        expect(userdata).is.string;
        expect(userdata.length).to.greaterThan(0);        
    });*/
});