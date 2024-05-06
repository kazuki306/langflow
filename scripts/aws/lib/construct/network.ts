import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_servicediscovery as servicediscovery,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';

export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // VPC等リソースの作成
    this.vpc = new ec2.Vpc(scope, 'VPC', {
      vpcName: 'langflow-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'langflow-Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'langflow-Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'langflow-Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
      ],
      natGateways: 1,
    })

    // Cluster
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: 'langflow-cluster',
      vpc: this.vpc,
      enableFargateCapacityProviders: true,
    });
    // Cloud Map
    this.cluster.addDefaultCloudMapNamespace({
      name: 'local',
    });

  }
}