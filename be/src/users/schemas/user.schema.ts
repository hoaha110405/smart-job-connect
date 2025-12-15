import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  name?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Remove sensitive/internal fields when converting to JSON
UserSchema.set('toJSON', {
  transform: function (doc: any, ret: any) {
    // remove mongoose specific fields
    delete ret.password;
    delete ret.__v;
    // provide id instead of _id
    ret.id = ret._id;
    delete ret._id;
  },
});
