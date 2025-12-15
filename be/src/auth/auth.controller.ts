import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request as ExRequest } from "express";
import { AuthService } from "./auth.service";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("register")
  register(@Body() dto: CreateUserDto) {
    return this.auth.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(@Body() dto: LoginDto) {
    const user = await this.auth.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const { access_token } = this.auth.login(user._id, user.email);
    console.log("User logged in:", user);
    return {
      accessToken: access_token,
      user: user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  logout() {
    // Using bearer tokens: logout is client-side (remove token), server can still return ok
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  profile(@Request() req: ExRequest) {
    return req.user;
  }
}
