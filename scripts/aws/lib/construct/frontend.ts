import { Stack, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_ecs as ecs,
  aws_s3 as s3,
  aws_apigateway as apigateway,
} from 'aws-cdk-lib';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { NodejsBuild } from 'deploy-time-build';


interface FrontEndProps {
  api:apigateway.RestApi;
}

export class Web extends Construct {
  readonly distribution;
  constructor(scope: Construct, id: string, props:FrontEndProps) {
    super(scope, id)

  // 
  // S3 + Cloud Front
  // 
  const commonBucketProps: s3.BucketProps = {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    autoDeleteObjects: true,
    removalPolicy: RemovalPolicy.DESTROY,
    objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    enforceSSL: true,
  };

  const { cloudFrontWebDistribution, s3BucketInterface } = new CloudFrontToS3(
    this,
    'Web',
    {
      insertHttpSecurityHeaders: false,
      loggingBucketProps: commonBucketProps,
      bucketProps: commonBucketProps,
      cloudFrontLoggingBucketProps: commonBucketProps,
      cloudFrontDistributionProps: {
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
          },
        ],
      },
    }
  );
  
  const endpoint = props.api.url
  
  new NodejsBuild(this, 'BuildFrontEnd', {
    assets: [
      {
        path: '../../src/frontend',
        exclude: [
          '.git',
          '.github',
          '.gitignore',
          '.prettierignore',
          'build',
          'node_modules'
        ],
      },
    ],
    nodejsVersion:20,
    destinationBucket: s3BucketInterface,
    distribution: cloudFrontWebDistribution,
    outputSourceDirectory: 'build',
    buildCommands: ['npm install', 'npm run build'],
    buildEnvironment: {
      VITE_AXIOS_BASE_URL: endpoint,
      NODE_ENV: "production"
    },
  });

  this.distribution = cloudFrontWebDistribution;

  new CfnOutput(this, 'URL', {
    value: this.distribution.domainName,
  });
}

}