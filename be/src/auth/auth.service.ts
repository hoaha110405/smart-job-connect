/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import * as bcrypt from "bcryptjs";
import { JwtService } from "@nestjs/jwt";
import { CreateUserDto } from "src/users/dto/create-user.dto";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException("Email không tồn tại");

    const match = await bcrypt.compare(pass, user.password);
    if (!match) throw new UnauthorizedException("Sai mật khẩu");

    const { password, ...result } = user.toObject();
    return result;
  }

  login(user_id: object, email: string) {
    const payload = { sub: user_id, email: email };
    return { access_token: this.jwt.sign(payload) };
  }

  async register(dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    const { password, ...rest } = user.toObject();
    return rest;
  }
}
