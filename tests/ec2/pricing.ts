import { expect } from 'chai';
import { faker } from '@faker-js/faker';
import { Ec2Pricing } from '../../src/libs/ec2/pricing';
import { genMockConfig } from '../../src/libs/mockConfig';

describe('EC2 pricing tests', () => { 
    const mockConfig = genMockConfig();
    const ec2Pricing = new Ec2Pricing(mockConfig);

    /*
    it('get services', async () => {         
        const services = await ec2Pricing.describeServices()

    });*/

    it('get ec2 ondemand price', async () => {         
        const c5Large = await ec2Pricing.getPriceForInstanceTypeUSD("c5.large")

        expect(c5Large).to.be.greaterThan(0)

        const t3Large = await ec2Pricing.getPriceForInstanceTypeUSD("t3.large")
        expect(await ec2Pricing.getPriceForInstanceTypeUSD("t3.large")).to.be.greaterThan(0)
        expect(t3Large).to.be.greaterThan(0)
        
        expect(c5Large).to.be.greaterThan(t3Large)
        
    });


});
