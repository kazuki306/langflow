import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2'

import { Network, EcrRepository, Web, BackEndCluster, Rds, EcsIAM, Rag, API} from './construct';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const errorMessageForBooleanContext = (key: string) => {
  return `There was an error setting $ {key}. Possible causes are as follows.
  - Trying to set it with the -c option instead of changing cdk.json
  - cdk.json is set to a value that is not a boolean (e.g. “true” double quotes are not required)
  - no items in cdk.json (unset) `;
};

export class LangflowBackendStack extends cdk.Stack {
  public readonly nlb: elb.NetworkLoadBalancer;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Kendra Enable
    const ragEnabled: boolean = this.node.tryGetContext('ragEnabled')!;
    if (typeof ragEnabled !== 'boolean') {
      throw new Error(errorMessageForBooleanContext('ragEnabled'));
    }
    if (ragEnabled) {
      new Rag(this, 'Rag', {
      });
    }

    // Arch
    const arch = ecs.CpuArchitecture.X86_64

    // VPC
    const { vpc, cluster, ecsBackSG, backendServicePort, dbSG, backendLogGroup, nlb, nlbTG } = new Network(this, 'Network')
    this.nlb = nlb
    
    // ECR
    const { ecrBackEndRepository } = new EcrRepository(this, 'Ecr', {
      arch:arch
    })

    // RDS
    // VPCとSGのリソース情報をPropsとして引き渡す
    const { rdsCluster } = new Rds(this, 'Rds', { vpc, dbSG })

    // IAM
    const { backendTaskRole, backendTaskExecutionRole } = new EcsIAM(this, 'EcsIAM',{
      rdsCluster:rdsCluster
    })

    const backendService = new BackEndCluster(this, 'backend', {
      cluster:cluster,
      ecsBackSG:ecsBackSG,
      ecrBackEndRepository:ecrBackEndRepository,
      backendTaskRole:backendTaskRole,
      backendTaskExecutionRole:backendTaskExecutionRole,
      backendLogGroup:backendLogGroup,
      backendServicePort:backendServicePort,
      rdsCluster:rdsCluster,
      arch:arch,
      nlbTG:nlbTG
    })
    backendService.node.addDependency(rdsCluster);

  }
}

interface FrontendStackProps extends cdk.StackProps {
  nlb: elb.NetworkLoadBalancer;
}
export class LangflowFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const api = new API(this, 'apigw',{
      nlb: props.nlb
    })
    const frontendService = new Web(this, 'frontend',{
      api:api.api,
    })

  }
}
