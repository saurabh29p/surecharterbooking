import { Config } from '@remotion/cli/config';

// No GPU in the render box: SwiftShader through ANGLE gives deterministic WebGL on the CPU.
Config.setChromiumOpenGlRenderer('swangle');
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv444p');
