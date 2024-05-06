import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from "aws-cdk-lib/aws-rds";
import * as cdk from 'aws-cdk-lib';

interface RdsProps {
  vpc: ec2.Vpc
  SGs: { [key: string]: ec2.SecurityGroup }
}

export class Rds extends Construct{
  readonly rdsCluster: rds.DatabaseCluster

  constructor(scope: Construct, id:string, props: RdsProps){
    super(scope, id);

    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MEDIUM)

    const engine_type = rds.DatabaseClusterEngine.auroraPostgres({
      version : rds.AuroraPostgresEngineVersion.VER_15_4
    })
    // RDSのパスワードを自動生成してSecrets Managerに格納
    const rdsCredentials = rds.Credentials.fromGeneratedSecret('db_user',{
      secretName: 'langflow-DbSecret',
    })
    
    // DB クラスターのパラメータグループ作成
    const clusterParameterGroup = new rds.ParameterGroup(scope, 'ClusterParameterGroup',{
      engine: engine_type,
      description: 'for-langflow',
    })
    clusterParameterGroup.bindToCluster({})

    // DB インスタンスのパラメタグループ作成
    const instanceParameterGroup = new rds.ParameterGroup(scope, 'InstanceParameterGroup',{
      engine: engine_type,
      description: 'for-langflow',
    })
    instanceParameterGroup.bindToInstance({})

    this.rdsCluster = new rds.DatabaseCluster(scope, 'LangflowDbCluster', {
      engine: engine_type,
      storageEncrypted: true,
      credentials: rdsCredentials,
      instanceIdentifierBase: 'langflow-instance',
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetGroupName: 'langflow-Isolated',
      }),
      securityGroups:[props.SGs.db],
      writer: rds.ClusterInstance.provisioned("WriterInstance", {
        instanceType: instanceType,
        enablePerformanceInsights: true,
        parameterGroup:instanceParameterGroup,
      }),
      // 2台目以降はreaders:で設定 
      parameterGroup: clusterParameterGroup,
      defaultDatabaseName: 'langflow',
    })
  }
}
