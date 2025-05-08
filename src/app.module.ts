import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.docker' : '.env',
    }),
    DatabaseModule,
    AuthModule,
    CoursesModule,
  ],
})
export class AppModule {}
