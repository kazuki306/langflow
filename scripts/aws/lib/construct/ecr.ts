import { RemovalPolicy } from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecrdeploy from 'cdk-ecr-deployment'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery'
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets'
import * as path from "path";
import { Construct } from 'constructs'

interface EcrRepoFromDockerfileProps {
  name: string;
  directory: string;
  file: string;
  exclude: string[];
  platform: Platform;
}

function EcrRepositoryFromDockerfile(scope: Construct ,props: EcrRepoFromDockerfileProps) {
  // Create ECR Repository from Dockerfiles
  const LifecycleRule = {
    tagStatus: ecr.TagStatus.ANY,
    description: 'Delete more than 30 image',
    maxImageCount: 30,
  }
  // Create ECR Repository
  const ecrRepository = new ecr.Repository(scope, `Langflow${props.name}Repository`, {
    repositoryName: `langflow-${props.name.toLowerCase()}-repository`,
    removalPolicy: RemovalPolicy.RETAIN,
    imageScanOnPush: true,
  })
  ecrRepository.addLifecycleRule(LifecycleRule)     // LifecycleRule作成

  // Create Docker Image Asset
  const dockerBackEndImageAsset = new DockerImageAsset(this, `DockerImageAsset-${props.name}`, {
    directory: props.directory,
    file: props.file,
    exclude: props.exclude,
    platform: props.platform,
  });

  // Deploy Docker Image to ECR Repository
  new ecrdeploy.ECRDeployment(this, `DeployImage-${props.name}`, {
    src: new ecrdeploy.DockerImageName(dockerBackEndImageAsset.imageUri),
    dest: new ecrdeploy.DockerImageName(this.ecrRepository.repositoryUri)
  });
  return ecrRepository
}

interface ECRProps {
  arch:ecs.CpuArchitecture;
}

export class EcrRepositories extends Construct {
  readonly ecrRepositories: { [key: string]: ecr.Repository }

  constructor(scope: Construct, id: string, props: ECRProps) {
    super(scope, id)

    this.ecrRepositories = {};
    const imagePlatform = props.arch == ecs.CpuArchitecture.ARM64 ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64;
    const langflowAppPath = path.join(__dirname, "../../../../../", "langflow");
    const containersPath = path.join(__dirname, "../../", "containers");
    const excludeDir = ['node_modules','.git', 'cdk.out'];

    const containersList = ['backend','pgadmin','result_backend','celeryworker','flower','broker','prometheus','grafana'];
    // Create ECR Repositories from Dockerfiles 
    for (const name of containersList){
      this.ecrRepositories[name] = EcrRepositoryFromDockerfile(this, {
        name: name,
        directory: containersPath,
        file: `${name}.Dockerfile`,
        exclude: excludeDir,
        platform: imagePlatform,
      })
    }
  }
}

