#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LangflowFrontendStack, LangflowBackendStack } from '../lib/cdk-stack';

const app = new cdk.App();

const backendStack = new LangflowBackendStack(app, 'LangflowBackendStack', {
});

const frontendStack = new LangflowFrontendStack(app, 'LangflowFrontEndStack', {
  nlb: backendStack.nlb
  nlbDNS:backendStack.nlbDNS
});

frontendStack.node.addDependency(backendStack);