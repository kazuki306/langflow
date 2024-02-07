import { Stack, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_ecs as ecs,
  aws_s3 as s3,
  aws_iam as iam,
  aws_apigateway as apigateway,
  aws_cloudfront  as cdn,
  aws_cloudfront_origins as cdn_origins
} from 'aws-cdk-lib';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { NodejsBuild } from 'deploy-time-build';


interface FrontEndProps {
  api:apigateway.RestApi;
}

export class Web extends Construct {
  readonly distribution: cdn.Distribution;
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

    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', commonBucketProps);

    const originAccessIdentity = new cdn.OriginAccessIdentity(
      this,
      'OriginAccessIdentity',
      {
        comment: 'website-distribution-originAccessIdentity',
      }
    );

    const webSiteBucketPolicyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.CanonicalUserPrincipal(
          originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
      resources: [`${websiteBucket.bucketArn}/*`],
    });

    websiteBucket.addToResourcePolicy(webSiteBucketPolicyStatement);

    this.distribution = new cdn.Distribution(this, 'distribution', {
      comment: 'website-distribution',
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          ttl: Duration.seconds(300),
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: '/index.html',
        },
        {
          ttl: Duration.seconds(300),
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
        },
      ],
      defaultBehavior: {
        allowedMethods: cdn.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cdn.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy:
          cdn.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        origin: new cdn_origins.S3Origin(websiteBucket, {
          originAccessIdentity,
        }),
        responseHeadersPolicy: new cdn.ResponseHeadersPolicy(
          this,
          "responseHeadersPolicy",
          {
            corsBehavior: {
              accessControlAllowOrigins: [`https://${this.distribution.domainName}`],
              accessControlAllowHeaders: ["*"],
              accessControlAllowMethods: ["ALL"],
              accessControlAllowCredentials: false,
              originOverride: true,
            },
          }
        ),
      },
      priceClass: cdn.PriceClass.PRICE_CLASS_ALL,
    });

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
    destinationBucket: websiteBucket,
    distribution: this.distribution,
    outputSourceDirectory: 'build',
    buildCommands: ['npm install', 'npm run build'],
    buildEnvironment: {
      VITE_AXIOS_BASE_URL: endpoint
    },
  });


  new CfnOutput(this, 'URL', {
    value: this.distribution.domainName,
  });
}

}