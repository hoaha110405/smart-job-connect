import { Injectable, ConflictException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CreateUserDto } from "./dto/create-user.dto";
import { User, UserDocument } from "./schemas/user.schema";
import * as bcrypt from "bcryptjs";

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private model: Model<UserDocument>) {}

  async create(dto: CreateUserDto) {
    const exists = await this.model.findOne({ email: dto.email });
    if (exists) throw new ConflictException("Email đã tồn tại");

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(dto.password, salt);

    const user = new this.model({ ...dto, password: hash });
    return user.save();
  }

  async findByEmail(email: string) {
    return this.model.findOne({ email });
  }
}
