import { RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_apigateway as apigateway,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';

export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: ecs.Cluster;
  readonly ecsBackSG: ec2.SecurityGroup;
  readonly backendServicePort: number
  readonly dbSG: ec2.SecurityGroup;
  readonly backendLogGroup: logs.LogGroup;
  readonly nlbTG: elb.NetworkTargetGroup;
  readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string) {
    super(scope, id)
    const nlb_listen_port=80
    this.backendServicePort = 7860

    // VPC等リソースの作成
    this.vpc = new ec2.Vpc(scope, 'VPC', {
      vpcName: 'langflow-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
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

    // NLBの設定
    const nlbSG = new ec2.SecurityGroup(scope, 'ALBSecurityGroup', {
      securityGroupName: 'nlb-sg',
      description: 'for nlb',
      vpc: this.vpc,
    })

    const nlb = new elb.NetworkLoadBalancer(this,'langflow-nlb',{
      vpc:this.vpc,
      vpcSubnets:{subnetType: SubnetType.PRIVATE_WITH_EGRESS},
      loadBalancerName: 'langflow-nlb',
      crossZoneEnabled:true,
      internetFacing:false,
      securityGroups:[nlbSG]
    })

    this.nlbTG = new elb.NetworkTargetGroup(this, `TargetGroup`, {
      targetGroupName: 'ecs-tagtet-group',
      vpc:this.vpc,
      port: nlb_listen_port,
      targetType: elb.TargetType.IP,
          deregistrationDelay: Duration.seconds(0) // 開発環境デプロイ高速化のため。本番環境は数値上げておく
      });
      
      nlb.addListener(`Listener`, {
          port: 80,
          defaultTargetGroups: [this.nlbTG]
      });
    //

    // VPC link
    const vpcLink = new apigateway.VpcLink(this, `NLB-VpcLink`, {
      vpcLinkName: 'api-vpc-link',
      description: 'Connect to the NLB API.',
      targets: [nlb]
    });
    
    // APIGW 
    this.api = new apigateway.RestApi(this, 'Api',{
      deployOptions: {
        stageName: 'backend',
        //実行ログの設定
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
      cloudWatchRole: true,
    });
    
    const proxy_resource = this.api.root.addResource('{proxy+}', {
      defaultCorsPreflightOptions: { // リソースに対してCORS設定　optionメソッドが追加される
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        statusCode: 200,
      },
    })
    proxy_resource.addMethod('ANY', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      uri: `http://${nlb.loadBalancerDnsName}/{proxy}`,
      options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
          requestParameters: {
            'integration.request.path.proxy' : 'method.request.path.proxy'
          }
    }}), {}
    );
    

    // vpc-link(vpc cidr) から nlbへのinbound 許可
    nlbSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))
    nlbSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443))

    // Cluster
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      clusterName: 'langflow-cluster',
      vpc: this.vpc,
      enableFargateCapacityProviders: true,
    });

    // ECS BackEndに設定するセキュリティグループ
    this.ecsBackSG = new ec2.SecurityGroup(scope, 'ECSBackEndSecurityGroup', {
      securityGroupName: 'langflow-ecs-back-sg',
      description: 'for langflow-back-ecs',
      vpc: this.vpc,
    })
    this.ecsBackSG.addIngressRule(nlbSG,ec2.Port.tcp(this.backendServicePort))

    // RDSに設定するセキュリティグループ
    this.dbSG = new ec2.SecurityGroup(scope, 'DBSecurityGroup', {
      allowAllOutbound: true,
      securityGroupName: 'langflow-db',
      description: 'for langflow-db',
      vpc: this.vpc,
    })
    // langflow-ecs-back-sg からのポート3306:mysql(5432:postgres)のインバウンドを許可
    this.dbSG.addIngressRule(this.ecsBackSG, ec2.Port.tcp(3306))

    // Create CloudWatch Log Group
    this.backendLogGroup = new logs.LogGroup(this, 'backendLogGroup', {
      logGroupName: 'langflow-backend-logs',
      removalPolicy: RemovalPolicy.DESTROY,
    });


  }
}