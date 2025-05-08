import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { RegisterUserDto } from './dto/register-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dot';
import { JwtService } from '@nestjs/jwt';
import { formatNeo4jDate } from 'src/common/utils/neo4j-date-util';

@Injectable()
export class AuthService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly jwtService: JwtService,
) {}

  async register(registerUserDto: RegisterUserDto) {
    const { email, username, password } = registerUserDto;

    // Check if user already exists
    const existingUser = await this.neo4jService.read(
      `MATCH (u:User {email: $email}) RETURN u`,
      { email },
    );
    if (existingUser.records.length > 0) {
      throw new BadRequestException('User already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user in Neo4j
    const result = await this.neo4jService.write(
      `CREATE (u:User {
        userId: apoc.create.uuid(),
        email: $email,
        username: $username,
        password: $hashedPassword,
        createdAt: datetime()
      }) RETURN u`,
      { email, username, hashedPassword },
    );

    // Get the created user
    const user = result.records[0].get('u').properties;

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    userWithoutPassword.createdAt = userWithoutPassword.createdAt? formatNeo4jDate(userWithoutPassword.createdAt):null;
    return userWithoutPassword;
  }  
  
  async login(loginUserDto: LoginUserDto) {
    const { email, password } = loginUserDto;

    // Find user by email
    const result = await this.neo4jService.read(
      `MATCH (u:User {email: $email}) RETURN u`,
      { email },
    );

    if (result.records.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = result.records[0].get('u').properties;
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const payload = { 
      sub: user.userId, 
      email: user.email,
      username: user.username 
    };
    const accessToken = this.jwtService.sign(payload);

    // Return user data and token (without password)
    const { password: _, ...userWithoutPassword } = user;


    userWithoutPassword.createdAt = userWithoutPassword.createdAt?formatNeo4jDate(userWithoutPassword.createdAt):null;

    return {
      user: userWithoutPassword,
      accessToken,
    };
  }
}