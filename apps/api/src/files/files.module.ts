import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { StoredFile } from './file.entity.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { LocalStorageDriver } from './local.driver.js';
import { S3StorageDriver } from './s3.driver.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage.js';

export function makeStorageDriver(config: AppConfig): StorageDriver {
  if (config.STORAGE_DRIVER === 's3') {
    return new S3StorageDriver({
      endpoint: config.S3_ENDPOINT!,
      bucket: config.S3_BUCKET!,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY_ID!,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalStorageDriver(config.STORAGE_LOCAL_DIR);
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StoredFile])],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: STORAGE_DRIVER, inject: [APP_CONFIG], useFactory: makeStorageDriver },
  ],
  exports: [FilesService],
})
export class FilesModule {}
