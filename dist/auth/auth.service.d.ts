import { Neo4jService } from 'nest-neo4j';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dot';
import { JwtService } from '@nestjs/jwt';
export declare class AuthService {
    private readonly neo4jService;
    private readonly jwtService;
    constructor(neo4jService: Neo4jService, jwtService: JwtService);
    register(registerUserDto: RegisterUserDto): Promise<any>;
    login(loginUserDto: LoginUserDto): Promise<{
        user: any;
        accessToken: string;
    }>;
}
