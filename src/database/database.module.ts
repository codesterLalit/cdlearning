import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Neo4jModule } from 'nest-neo4j';

@Module({
  imports: [
    Neo4jModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        scheme: 'bolt',
        host: config.get('NEO4J_URI').split('//')[1].split(':')[0],
        port: config.get('NEO4J_URI').split(':')[2],
        username: config.get('NEO4J_USERNAME'),
        password: config.get('NEO4J_PASSWORD'),
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [ Neo4jModule],
})
export class DatabaseModule {}
