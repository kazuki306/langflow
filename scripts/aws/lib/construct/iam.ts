import { RemovalPolicy, Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import {
  aws_rds as rds,
  aws_iam as iam,
} from 'aws-cdk-lib';

interface IAMProps {
  rdsCluster:rds.DatabaseCluster
}

export class EcsIAM extends Construct {
  readonly ecsTaskRoles: { [key:string]: iam.Role };
  readonly ecsTaskExecutionRoles: { [key:string]: iam.Role };

  constructor(scope: Construct, id: string, props:IAMProps) {
    super(scope, id)

    // Policy Statements
    // ECS Policy State
    const ECSExecPolicyStatement = new iam.PolicyStatement({
      sid: 'allowECSExec',
      resources: ['*'],
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
    });

    // --- Create Rag Policy ---
    // Bedrock Policy State
    const BedrockPolicyStatement = new iam.PolicyStatement({
      sid: 'allowBedrockAccess',
      resources: ['*'],
      actions: [
        'bedrock:*',
      ],
    });
    // Kendra Policy State
    const KendraPolicyStatement = new iam.PolicyStatement({
      sid: 'allowKendraAccess',
      resources: ['*'],
      actions: [
        'kendra:*'
      ],
    });
    const RagAccessPolicy = new iam.Policy(this, 'RAGFullAccess', {
      statements: [KendraPolicyStatement,BedrockPolicyStatement],
    })
    // ---

    // To retrieve the database authentication credentials from Secrets Manager
    const SecretsManagerPolicy = new iam.Policy(this, 'SMGetPolicy', {
      statements: [new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.rdsCluster.secret!.secretArn],
      })],
    })

    // --- BackEnd Task Role ---
    const containersList = ['backend','pgadmin','result_backend','celeryworker','flower','broker','prometheus','grafana'];
    for (const role_name of containersList){
      this.ecsTaskRoles[role_name] = new iam.Role(this, `ecsTaskRole-${role_name}`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      });
      // ECS Exec Policyの付与, KendraとBedrockのアクセス権付与
      this.ecsTaskRoles[role_name].addToPolicy(ECSExecPolicyStatement);
      this.ecsTaskRoles[role_name].attachInlinePolicy(RagAccessPolicy);
      // --- 

      // BackEnd Task ExecutionRole 
      this.ecsTaskExecutionRoles[role_name] = new iam.Role(this, 'backendTaskExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          {
            managedPolicyArn:
              'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
          },
        ],
      });
      this.ecsTaskExecutionRoles[role_name].attachInlinePolicy(SecretsManagerPolicy);
      this.ecsTaskExecutionRoles[role_name].attachInlinePolicy(RagAccessPolicy);
    }
  }
}