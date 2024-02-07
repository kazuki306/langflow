import { Construct } from 'constructs'
import {
  aws_apigateway as apigateway,
  aws_elasticloadbalancingv2 as elb,
} from 'aws-cdk-lib';

interface APIProps {
  nlb:elb.NetworkLoadBalancer;
  nlbDNS:string;
}

function add_proxy(api_resource:apigateway.IResource, nlbDNS: string,vpcLink: apigateway.VpcLink,resource_path: string) {
  const proxy_resource = api_resource.addResource('{proxy+}', {
    defaultCorsPreflightOptions: { // リソースに対してCORS設定 optionメソッドが追加される
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      statusCode: 200,
    },
  })
  let uri = resource_path ? `http://${nlbDNS}/${resource_path}/{proxy}` : `http://${nlbDNS}/{proxy}`

  proxy_resource.addMethod('ANY', new apigateway.Integration({
    type: apigateway.IntegrationType.HTTP_PROXY,
    integrationHttpMethod: 'ANY',
    uri: uri,
    options: {
        connectionType: apigateway.ConnectionType.VPC_LINK,
        vpcLink: vpcLink,
        requestParameters: {
          'integration.request.path.proxy' : 'method.request.path.proxy'
        }
  }}), {
    requestParameters: {
    'method.request.path.proxy': true,
  },
  }
  );
}

function add_resourse(api_resource:apigateway.IResource, nlbDNS: string,vpcLink: apigateway.VpcLink,add_resource_name: string, resource_path: string, methodList: string[]): apigateway.IResource {
  const proxy_resource = api_resource.addResource(add_resource_name, {
    defaultCorsPreflightOptions: { // リソースに対してCORS設定　optionメソッドが追加される
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: apigateway.Cors.ALL_METHODS,
      allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      statusCode: 200,
    },
  })
  if(resource_path){
    for (let i =0; i< methodList.length; i++){
      proxy_resource.addMethod(methodList[i], new apigateway.Integration({
        type: apigateway.IntegrationType.HTTP,
        integrationHttpMethod: methodList[i],
        uri: `http://${nlbDNS}/${resource_path}/`,
        options: {
            connectionType: apigateway.ConnectionType.VPC_LINK,
            vpcLink: vpcLink,
      }}), {}
      );
    }
  }
  return proxy_resource
}

export class API extends Construct {
  readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props:APIProps) {
    super(scope, id)
    const nlb = props.nlb

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
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      cloudWatchRole: true,
    });
    
    // ~/proxy
    add_proxy(this.api.root,props.nlbDNS,vpcLink,'')
    // ~/api/v1/
    const resource_api = add_resourse(this.api.root,props.nlbDNS,vpcLink,'api','',[])
    const resource_v1 = add_resourse(resource_api,props.nlbDNS,vpcLink,'v1','',[])
    // ~/api/v1/api_key
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'api_key','api/v1/api_key',['GET','POST']),props.nlbDNS,vpcLink,'api/v1/api_key')
    
    // ~/api/v1/chat
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'chat','',[]),props.nlbDNS,vpcLink,'api/v1/chat')

    // ~/api/v1/credential
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'credential','api/v1/credential',['GET','POST']),props.nlbDNS,vpcLink,'api/v1/credential')

    // ~/api/v1/endpoints
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'endpoints','',[]),props.nlbDNS,vpcLink,'api/v1/endpoints')

    // ~/api/v1/flows
    const resource_flows = add_resourse(resource_v1,props.nlbDNS,vpcLink,'flows','api/v1/flows',['GET','POST'])
    add_proxy(resource_flows,props.nlbDNS,vpcLink,'api/v1/flows')
    add_resourse(resource_flows,props.nlbDNS,vpcLink,'batch','api/v1/flows/batch',['POST'])
    add_resourse(resource_flows,props.nlbDNS,vpcLink,'upload','api/v1/flows/upload',['POST'])
    add_resourse(resource_flows,props.nlbDNS,vpcLink,'download','api/v1/flows/download',['GET'])

    // ~/api/v1/login
    add_proxy(resource_v1,props.nlbDNS,vpcLink,'api/v1')

    // ~/api/v1/store
    const resource_store = add_resourse(resource_v1,props.nlbDNS,vpcLink,'store','',[])
    add_proxy(resource_store,props.nlbDNS,vpcLink,'api/v1/store')
    add_proxy(add_resourse(resource_store,props.nlbDNS,vpcLink,'check','api/v1/store/check',['GET']),props.nlbDNS,vpcLink,'api/v1/store/check')
    add_proxy(add_resourse(resource_store,props.nlbDNS,vpcLink,'components','api/v1/store/components',['GET','POST']),props.nlbDNS,vpcLink,'api/v1/store/components')

    // ~/api/v1/users
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'users','api/v1/users',['GET','POST']),props.nlbDNS,vpcLink,'api/v1/users')

    // ~/api/v1/validate
    add_proxy(add_resourse(resource_v1,props.nlbDNS,vpcLink,'validate','',[]),props.nlbDNS,vpcLink,'api/v1/validate')

  }
}