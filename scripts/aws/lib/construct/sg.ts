import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';

interface SGProps {
  vpc: ec2.Vpc;
}

type ContainerPort = {
  ports: number[];
  ingress: string;
};

export type ContainerPorts = {
  [key: string]: ContainerPort;
};

export class SG extends Construct {
  readonly SGs: { [key: string]: ec2.SecurityGroup };
  readonly TGs: { [key: string]: elb.ApplicationTargetGroup };
  readonly alb: elb.ApplicationLoadBalancer;
  readonly containerPorts: ContainerPorts;

  constructor(scope: Construct, id: string, props: SGProps ) {
    super(scope, id)

    // init SGs
    this.SGs = {};
    this.TGs = {};

    this.containerPorts = {
      backend:{ports:[7860],ingress:'alb'},
      pgadmin:{ports:[5050],ingress:'alb'},
      result_backend:{ports:[6379],ingress:'backend'},
      celeryworker:{ports:[7860],ingress:'backend'},
      flower:{ports:[5555],ingress:'alb'},
      broker:{ports:[5672, 15672],ingress:'backend'},
      prometheus:{ports:[9090],ingress:'alb'},
      grafana:{ports:[3000],ingress:'alb'},
      db:{ports:[5432],ingress:'backend'}
    };

    // --- for ALB settings ---
    const albSG = new ec2.SecurityGroup(scope, 'alb-sg', {
      securityGroupName: 'alb-sg',
      description: 'for alb-sg',
      vpc: props.vpc,
    })
    this.SGs['alb'] = albSG

    this.alb = new elb.ApplicationLoadBalancer(this,'langflow-alb',{
      internetFacing: true, //インターネットからのアクセスを許可するかどうか指定
      loadBalancerName: 'langflow-alb',
      securityGroup: albSG, //作成したセキュリティグループを割り当てる
      vpc:props.vpc,   
    })
    const listener = this.alb.addListener('Listener', { port: 80 });

    // --- for target Group settings ---
    this.TGs['backend'] = listener.addTargets('targetGroup-for-backend', {
      port: this.containerPorts.backend.ports[0],
      protocol: elb.ApplicationProtocol.HTTP,
      healthCheck: {
        enabled: true,
        path: '/health',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 4,
        interval: Duration.seconds(100),
        timeout: Duration.seconds(30),
        healthyHttpCodes: '200',
      },
    });
    // ---

    // ECS Container に設定するセキュリティグループ
    for (const key in this.containerPorts){
      this.SGs[key] = new ec2.SecurityGroup(scope, `${key}-sg`, {
        securityGroupName: `langflow-${key}-sg`,
        description: `for langflow-${key}-ecs`,
        vpc: props.vpc,
      })
    }

    for (const key in this.containerPorts){
      for ( const targetPort of this.containerPorts[key].ports){
        this.SGs[key].addIngressRule(this.SGs[this.containerPorts[key].ingress], ec2.Port.tcp(targetPort))
      }
    }

  }
}