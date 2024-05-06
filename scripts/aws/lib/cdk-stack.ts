import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs'

import { Network, EcrRepositories, SG, Web, BackendCluster, Rds, EcsIAM, Rag} from './construct';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const errorMessageForBooleanContext = (key: string) => {
  return `There was an error setting $ {key}. Possible causes are as follows.
  - Trying to set it with the -c option instead of changing cdk.json
  - cdk.json is set to a value that is not a boolean (e.g. “true” double quotes are not required)
  - no items in cdk.json (unset) `;
};


export class LangflowAppStack extends cdk.Stack {
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
    const { vpc, cluster} = new Network(this, 'Network')

    // SG
    const { SGs, TGs, alb, containerPorts }= new SG(this, 'SG', {
      vpc:vpc
    })

    // ECR
    const { ecrRepositories } = new EcrRepositories(this, 'Ecr', {
      arch:arch
    })

    // RDS
    // VPCとSGのリソース情報をPropsとして引き渡す
    const { rdsCluster } = new Rds(this, 'Rds', { vpc, SGs })

    // IAM
    const { ecsTaskRoles, ecsTaskExecutionRoles } = new EcsIAM(this, 'EcsIAM',{
      rdsCluster:rdsCluster
    })

    const backendService = new BackendCluster(this, 'backend', {
      cluster:cluster,
      ecrRepositories:ecrRepositories,
      SGs:SGs,
      TGs:TGs,
      ecsTaskRoles:ecsTaskRoles,
      ecsTaskExecutionRoles:ecsTaskExecutionRoles,
      rdsCluster:rdsCluster,
      arch:arch,
      containerPorts:containerPorts
    })
    backendService.node.addDependency(cluster);
    backendService.node.addDependency(rdsCluster);

    const frontendService = new Web(this, 'frontend',{
      cluster:cluster,
      alb:alb,
      SGs:SGs,
    })
    frontendService.node.addDependency(backendService);

  }
}
