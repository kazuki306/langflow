import { Duration, RemovalPolicy } from 'aws-cdk-lib'
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
import { EcrRepositories } from './ecr';
import { ContainerPorts } from './sg';
const path = require('path');
dotenv.config({path: path.join(__dirname, "../../.env")});

interface BackEndProps {
  cluster: ecs.Cluster;
  SGs: { [key: string]: ec2.SecurityGroup };
  TGs: { [key: string]: elb.ApplicationTargetGroup };
  ecrRepositories: { [key: string]: ecr.Repository };
  ecsTaskRoles: { [key: string]: iam.Role };
  ecsTaskExecutionRoles: { [key: string]: iam.Role };
  rdsCluster:rds.DatabaseCluster;
  arch:ecs.CpuArchitecture;
  containerPorts: ContainerPorts;
};

interface ContainerProps {
  name: string;
  cluster:ecs.Cluster;
  ecrRepository: ecr.Repository ;
  port: number[];
  TaskRole: iam.Role;
  TaskExecRole: iam.Role;
  environment: { [key: string]: string };
  secrets: { [key: string]: ecs.Secret };
  memoryLimitMiB: number;
  cpu: number;
  arch: ecs.CpuArchitecture;
  sg: ec2.SecurityGroup;
};

function ContainerDefinition(scope: Construct ,props: ContainerProps){
  // Create Service From ECR Repository
  // Create CloudWatch Log Group
  const containerLogGroup = new logs.LogGroup(this, `Langflow-${props.name}-LogGroup`, {
    logGroupName: `langflow-${props.name}-container-logs`,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  // Create Backend Fargate Service
  const containerTaskDefinition = new ecs.FargateTaskDefinition(
    this,
    `${props.name}-TaskDef`,
    {
        memoryLimitMiB: props.memoryLimitMiB,
        cpu: props.cpu,
        executionRole: props.TaskExecRole,
        runtimePlatform:{
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: props.arch,
        },
        taskRole: props.TaskRole,
    }
  );
  containerTaskDefinition.addContainer(`${props.name}-Container`, {
    image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository, "latest"),
    containerName:`langflow-${props.name}-container`,
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: `${props.name}-task-logstream`,
      logGroup: containerLogGroup,
    }),
    environment:props.environment,
    portMappings: props.port.map(p => ({
      containerPort: p,
      protocol: ecs.Protocol.TCP // TCPプロトコルを使用
    })),
    // Secretの設定
    secrets: props.secrets
  });
  
  const containerService = new ecs.FargateService(this, `${props.name}Service`, {
    cluster: props.cluster,
    serviceName: props.name,
    taskDefinition: containerTaskDefinition,
    enableExecuteCommand: true,
    securityGroups: [props.sg],
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    serviceConnectConfiguration: {
      services: props.port.map(p => ({
        portMappingName: `${props.name}`,
        port: p,
        discoveryName: `${props.name}` 
      })),
      logDriver: ecs.LogDrivers.awsLogs({
        streamPrefix: `${props.name}-serviceconnect-logstream`,
      }),
    },
  });
  return containerService
}


export class BackendCluster extends Construct {
  constructor(scope: Construct, id: string, props:BackEndProps) {
    super(scope, id)
    // Secrets ManagerからDB認証情報を取ってくる
    const secretsDB = props.rdsCluster.secret!;

    // --- backend ---
    let service_name = 'backend'
    const backendService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
        "LANGFLOW_AUTO_LOGIN" : process.env.LANGFLOW_AUTO_LOGIN ?? 'false',
        "LANGFLOW_SUPERUSER" : process.env.LANGFLOW_SUPERUSER ?? "admin",
        "LANGFLOW_SUPERUSER_PASSWORD" : process.env.LANGFLOW_SUPERUSER_PASSWORD ?? "123456"
      },
      secrets: {
        "dbname": ecs.Secret.fromSecretsManager(secretsDB, 'dbname'),
        "username": ecs.Secret.fromSecretsManager(secretsDB, 'username'),
        "host": ecs.Secret.fromSecretsManager(secretsDB, 'host'),
        "password": ecs.Secret.fromSecretsManager(secretsDB, 'password'),
      },
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
    props.TGs[service_name].addTarget(backendService);

    // --- pgadmin ---
    service_name = 'pgadmin'
    const pgadminService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
        "PGADMIN_DEFAULT_EMAIL" : process.env.PGADMIN_DEFAULT_EMAIL ?? 'admin@admin.com',
        "PGADMIN_DEFAULT_PASSWORD" : process.env.PGADMIN_DEFAULT_PASSWORD ?? "admin",
      },
      secrets: {},
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
    props.TGs[service_name].addTarget(pgadminService);

    // --- flower ---
    service_name = 'flower'
    const flowerService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
        "LANGFLOW_AUTO_LOGIN" : process.env.LANGFLOW_AUTO_LOGIN ?? 'false',
        "LANGFLOW_SUPERUSER" : process.env.LANGFLOW_SUPERUSER ?? "admin",
        "LANGFLOW_SUPERUSER_PASSWORD" : process.env.LANGFLOW_SUPERUSER_PASSWORD ?? "123456",
        // flower env
        "LANGFLOW_CACHE_TYPE" : process.env.LANGFLOW_CACHE_TYPE ?? 'redis',
        "LANGFLOW_REDIS_HOST" : process.env.LANGFLOW_REDIS_HOST ?? "result_backend.local",
        "LANGFLOW_REDIS_PORT" : process.env.LANGFLOW_REDIS_PORT ?? "6379",
        "LANGFLOW_REDIS_DB" : process.env.LANGFLOW_REDIS_DB ?? "0",
        "LANGFLOW_REDIS_EXPIRE" : process.env.LANGFLOW_REDIS_EXPIRE ?? "3600",
        "LANGFLOW_REDIS_PASSWORD" : process.env.LANGFLOW_REDIS_PASSWORD ?? "",
        "FLOWER_UNAUTHENTICATED_API" : process.env.FLOWER_UNAUTHENTICATED_API ?? "True",
        "BROKER_URL" : process.env.BROKER_URL ?? "amqp://langflow:langflow@broker:5672",
        "RESULT_BACKEND" : process.env.RESULT_BACKEND ?? "redis://result_backend.local:6379/0",
        "C_FORCE_ROOT" : process.env.C_FORCE_ROOT ?? "true",
      },
      secrets: {
        "dbname": ecs.Secret.fromSecretsManager(secretsDB, 'dbname'),
        "username": ecs.Secret.fromSecretsManager(secretsDB, 'username'),
        "host": ecs.Secret.fromSecretsManager(secretsDB, 'host'),
        "password": ecs.Secret.fromSecretsManager(secretsDB, 'password'),
      },
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
    props.TGs[service_name].addTarget(flowerService);

    // --- prometheus ---
    service_name = 'prometheus'
    const prometheusService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
      },
      secrets: {},
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
    props.TGs[service_name].addTarget(prometheusService);

    // --- grafana ---
    service_name = 'grafana'
    const grafanaService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
      },
      secrets: {},
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
    props.TGs[service_name].addTarget(grafanaService);

    // --- result_backend ---
    service_name = 'result_backend'
    const result_backendService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
      },
      secrets: {},
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })

    // --- celeryworker ---
    service_name = 'celeryworker'
    const celeryworkerService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
        "LANGFLOW_AUTO_LOGIN" : process.env.LANGFLOW_AUTO_LOGIN ?? 'false',
        "LANGFLOW_SUPERUSER" : process.env.LANGFLOW_SUPERUSER ?? "admin",
        "LANGFLOW_SUPERUSER_PASSWORD" : process.env.LANGFLOW_SUPERUSER_PASSWORD ?? "123456"
      },
      secrets: {
        "dbname": ecs.Secret.fromSecretsManager(secretsDB, 'dbname'),
        "username": ecs.Secret.fromSecretsManager(secretsDB, 'username'),
        "host": ecs.Secret.fromSecretsManager(secretsDB, 'host'),
        "password": ecs.Secret.fromSecretsManager(secretsDB, 'password'),
      },
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })

    // --- broker ---
    service_name = 'broker'
    const brokerService = ContainerDefinition(scope, {
      name: service_name,
      cluster: props.cluster,
      ecrRepository: props.ecrRepositories[service_name],
      port: props.containerPorts[service_name].ports,
      TaskRole: props.ecsTaskRoles[service_name],
      TaskExecRole: props.ecsTaskExecutionRoles[service_name],
      environment: {
        "RABBITMQ_DEFAULT_USER" : process.env.RABBITMQ_DEFAULT_USER ?? "langflow",
        "RABBITMQ_DEFAULT_PASS" : process.env.RABBITMQ_DEFAULT_PASS ?? "langflow",
      },
      secrets: {},
      memoryLimitMiB: 3072,
      cpu: 1024,
      arch: props.arch,
      sg: props.SGs[service_name]
    })
  }
}