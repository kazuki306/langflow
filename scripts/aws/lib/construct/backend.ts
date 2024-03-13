import { Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs';
import {
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_ecr as ecr,
    aws_rds as rds,
    aws_servicediscovery as servicediscovery,
    aws_iam as iam,
    aws_logs as logs,
    aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
const path = require('path');
dotenv.config({path: path.join(__dirname, "../../.env")});

interface BackEndProps {
  cluster: ecs.Cluster
  ecsBackSG:ec2.SecurityGroup
  ecrBackEndRepository:ecr.Repository
  backendTaskRole: iam.Role;
  backendTaskExecutionRole: iam.Role;
  backendLogGroup: logs.LogGroup;
  rdsCluster:rds.DatabaseCluster
  arch:ecs.CpuArchitecture
  albTG: elb.ApplicationTargetGroup;
}

export class BackEndCluster extends Construct {
  
  constructor(scope: Construct, id: string, props:BackEndProps) {
    super(scope, id)
    const backendServiceName = 'backend'
    const backendServicePort = 7860
    const backendTaskMemory = 1024*32
    const backendTaskvCPU = 1024*16
    // Secrets ManagerからDB認証情報を取ってくる
    const secretsDB = props.rdsCluster.secret!;

    // Create Backend Fargate Service
    const backendTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      'BackEndTaskDef',
      {
          memoryLimitMiB: backendTaskMemory,
          cpu: backendTaskvCPU,
          executionRole: props.backendTaskExecutionRole,
          runtimePlatform:{
            operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
            cpuArchitecture: props.arch,
          },
          taskRole: props.backendTaskRole,
      }
    );
    backendTaskDefinition.addContainer('backendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrBackEndRepository, "latest"),
      containerName:'langflow-back-container',
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'my-stream',
        logGroup: props.backendLogGroup,
      }),
      environment:{
        "LANGFLOW_AUTO_LOGIN" : process.env.LANGFLOW_AUTO_LOGIN ?? 'false',
        "LANGFLOW_SUPERUSER" : process.env.LANGFLOW_SUPERUSER ?? "admin",
        "LANGFLOW_SUPERUSER_PASSWORD" : process.env.LANGFLOW_SUPERUSER_PASSWORD ?? "123456"
      },
      portMappings: [
          {
              containerPort: backendServicePort,
              protocol: ecs.Protocol.TCP,
          },
      ],
      // Secretの設定
      secrets: {
        "dbname": ecs.Secret.fromSecretsManager(secretsDB, 'dbname'),
        "username": ecs.Secret.fromSecretsManager(secretsDB, 'username'),
        "host": ecs.Secret.fromSecretsManager(secretsDB, 'host'),
        "password": ecs.Secret.fromSecretsManager(secretsDB, 'password'),
      },
    });
    
    const backendService = new ecs.FargateService(this, 'BackEndService', {
      cluster: props.cluster,
      serviceName: backendServiceName,
      taskDefinition: backendTaskDefinition,
      enableExecuteCommand: true,
      securityGroups: [props.ecsBackSG],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });
    props.albTG.addTarget(backendService);

    // auto scaling settings by cpu utilization
    const scaling = backendService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 5,
    })
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    })
  }
}