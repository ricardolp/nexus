import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SoftDeleteService } from './soft-delete.service';

@Module({
  providers: [PrismaService, SoftDeleteService],
  exports: [PrismaService, SoftDeleteService],
})
export class DbModule {}
