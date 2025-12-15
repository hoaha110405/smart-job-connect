import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { Schema as MongooseSchema } from "mongoose";

@Schema({ timestamps: true })
export class Cv extends Document {
  // --- Core fields ---
  // @Prop({ required: true }) userId: string;
  @Prop() avatarUrl: string;
  @Prop({ required: true }) fullname: string;
  @Prop() preferredName: string;
  @Prop() email: string;
  @Prop() phone: string;

  @Prop({
    type: {
      city: String,
      state: String,
      country: String,
    },
  })
  location: { city: string; state: string; country: string };

  @Prop() headline: string;
  @Prop() summary: string;

  // @Prop({ required: true }) createdBy: string; // <– thêm

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy: any;

  // --- Job target & preferences ---
  @Prop() targetRole: string;
  @Prop({ type: [String] }) employmentType: string[];
  @Prop() salaryExpectation: string;
  @Prop() availability: string;

  // --- Skills ---
  @Prop({
    type: [
      {
        name: String,
        level: String,
        category: String,
        years: Number,
      },
    ],
    default: [],
  })
  skills: {
    name: string;
    level: string;
    category: string;
    years: number;
  }[];

  // --- Experience / Work History ---
  @Prop({
    type: [
      {
        id: String,
        title: String,
        company: String,
        companyWebsite: String,
        location: String,
        from: Date,
        to: Date,
        isCurrent: Boolean,
        employmentType: String,
        teamSize: Number,
        responsibilities: [String],
        achievements: [String],
        tags: [String],
      },
    ],
    default: [],
  })
  experiences: any[];

  // --- Education ---
  @Prop({
    type: [
      {
        degree: String,
        major: String,
        school: String,
        from: Date,
        to: Date,
        gpa: String,
      },
    ],
    default: [],
  })
  education: any[];

  // --- Projects ---
  @Prop({
    type: [
      {
        name: String,
        description: String,
        role: String,
        from: Date,
        to: Date,
        techStack: [String],
        url: String,
        metrics: [String],
      },
    ],
    default: [],
  })
  projects: any[];

  // --- Certifications ---
  @Prop({
    type: [
      {
        name: String,
        issuer: String,
        issueDate: Date,
        expiryDate: Date,
        credentialUrl: String,
      },
    ],
    default: [],
  })
  certifications: any[];

  // --- Languages ---
  @Prop({
    type: [
      {
        name: String,
        level: String,
      },
    ],
    default: [],
  })
  languages: any[];

  // --- Portfolio ---
  @Prop({
    type: [
      {
        mediaType: String,
        url: String,
        description: String,
      },
    ],
    default: [],
  })
  portfolio: any[];

  // --- References ---
  @Prop({
    type: [
      {
        name: String,
        relation: String,
        contact: String,
        note: String,
      },
    ],
    default: [],
  })
  references: any[];

  // --- System fields ---
  @Prop({ default: "draft" }) status: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: 1 }) version: number;

  @Prop({
    type: {
      filename: String,
      originalname: String,
      path: String,
      mimetype: String,
      size: Number,
      uploadedAt: Date,
    },
    default: null,
  })
  file?: any;
}

export const CvSchema = SchemaFactory.createForClass(Cv);
