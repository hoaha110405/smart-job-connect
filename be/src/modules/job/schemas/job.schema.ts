// src/job/schemas/job.schema.ts
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { Schema as MongooseSchema } from "mongoose";

export type JobDocument = Job & Document;

@Schema({ timestamps: true })
export class Job {
  // Core / Metadata
  @Prop({ required: true, index: true }) companyId: string;
  @Prop({ required: true }) title: string;
  @Prop({ index: true }) slug?: string;
  @Prop({ default: "draft", index: true }) status?:
    | "draft"
    | "published"
    | "closed";
  @Prop({ default: "private" }) visibility?: "public" | "private" | "unlisted";

  // @Prop({ required: true }) createdBy: string; // <– thêm
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: "User", required: true })
  createdBy: any;

  // Company info
  @Prop() companyName?: string;
  @Prop() companyLogoUrl?: string;
  @Prop() companyWebsite?: string;
  @Prop() companyLocation?: string;
  @Prop() companySize?: string;
  @Prop() companyIndustry?: string;

  // Role / location
  @Prop() department?: string;
  @Prop({
    type: {
      city: String,
      state: String,
      country: String,
      remoteType: String, // 'onsite' | 'hybrid' | 'remote'
    },
    default: {},
  })
  location?: {
    city?: string;
    state?: string;
    country?: string;
    remoteType?: string;
  };

  @Prop({ type: [String], default: [] })
  employmentType?: string[]; // fulltime, parttime, contract, internship, freelance

  @Prop() seniority?: string; // intern|junior|mid|senior|lead|manager|director
  @Prop() teamSize?: number;

  // Description & requirements
  @Prop() description?: string; // rich text / markdown
  @Prop({ type: [String], default: [] }) responsibilities?: string[];
  @Prop({ type: [String], default: [] }) requirements?: string[];
  @Prop({ type: [String], default: [] }) niceToHave?: string[];

  @Prop({
    type: [
      {
        name: String,
        level: String,
      },
    ],
    default: [],
  })
  skills?: { name: string; level?: string }[];

  @Prop() experienceYears?: number;
  @Prop() educationLevel?: string;

  // Compensation & benefits
  @Prop({
    type: {
      min: Number,
      max: Number,
      currency: String,
      period: String, // month/year
    },
    default: {},
  })
  salary?: { min?: number; max?: number; currency?: string; period?: string };

  @Prop({ type: [String], default: [] }) benefits?: string[];
  @Prop() bonus?: string;
  @Prop() equity?: string;

  // Application info
  @Prop() applyUrl?: string;
  @Prop() applyEmail?: string;
  @Prop({
    type: {
      name: String,
      email: String,
      phone: String,
    },
    default: {},
  })
  recruiter?: { name?: string; email?: string; phone?: string };

  @Prop() howToApply?: string;
  @Prop() applicationDeadline?: Date;

  // Tags, counters, metadata
  @Prop({ type: [String], default: [] }) tags?: string[];
  @Prop({ type: [String], default: [] }) categories?: string[];
  @Prop({ default: false }) remote?: boolean;
  @Prop({ default: 0 }) views?: number;
  @Prop({ default: 0 }) applicationsCount?: number;

  // Screening / ATS
  @Prop({
    type: [
      {
        q: String,
        type: String, // text / number / single-choice / multi-choice
        required: Boolean,
        options: [String],
      },
    ],
    default: [],
  })
  preScreenQuestions?: Array<{
    q: string;
    type?: string;
    required?: boolean;
    options?: string[];
  }>;

  @Prop({ type: [String], default: [] }) requiredDocs?: string[];

  // Admin / workflow
  @Prop() publishedBy?: string;
  @Prop() approvedAt?: Date;
  @Prop() approvedBy?: string;
  @Prop({ default: false }) archived?: boolean;
  @Prop({ default: 1 }) version?: number;
}

export const JobSchema = SchemaFactory.createForClass(Job);
