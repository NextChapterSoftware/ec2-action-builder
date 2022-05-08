import { expect } from 'chai';
//import { faker } from '@faker-js/faker';
import { Ec2Instance } from '../../src/libs/ec2/ec2';
import { genMockConfig } from '../../src/libs/mockConfig';

describe('EC2 lib tests', () => { 
    const mockConfig = genMockConfig();
    const ec2 = new Ec2Instance(mockConfig);

    /*
    it('get all subnets', async () => { 
        const subnets = await ec2.getAllSubnets();
        expect(subnets.length).to.greaterThan(0);        
    });

    it('get subnet az', async () => { 
        expect(await ec2.getSubnetAz()).to.equal('us-west-2c');        
    });

    it('get spot instance price', async () => {         
        expect(await ec2.getSpotInstancePrice()).to.be.greaterThan(0);        
    });
    */
    it('get instance sizes for type', async () => {         
        expect((await ec2.getInstanceSizesForType("c5")).length).to.be.greaterThan(0);
        expect((await ec2.getInstanceSizesForType("foobar")).length).equals(0);
    });

    it('get next larger instance', async () => {         
        
        expect(await ec2.getNextLargerInstanceType("c5.large")).equals("c5.xlarge");
        expect(await ec2.getNextLargerInstanceType("c5.24xlarge")).equals("c5.24xlarge");
    });

    it('get next larger spot instance for current ondemand price', async () => {         
        const nextInstanceType = await ec2.bestSpotSizeForOnDemandPrice("c5.large");
        expect(nextInstanceType).is.string
        expect(nextInstanceType.length).is.greaterThan(0)
        expect(nextInstanceType).to.include("c5")
    });


});