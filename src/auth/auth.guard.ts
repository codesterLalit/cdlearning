// auth/auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    console.log("token--->", token)
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET')
      });
      console.log("payload-->",payload)
      request.user = payload;
    } catch(error) {
        console.log(error)
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    console.log(request.headers.authorization)
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    console.log(type)
    console.log("token: ", token)
    return type === 'Bearer' ? token : undefined;
  }
}