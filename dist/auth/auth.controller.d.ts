import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dot';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(registerUserDto: RegisterUserDto): Promise<any>;
    login(loginUserDto: LoginUserDto): Promise<{
        user: any;
        accessToken: string;
    }>;
}
