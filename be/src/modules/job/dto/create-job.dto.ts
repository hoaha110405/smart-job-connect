import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsUrl,
  IsBoolean,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";

// --- Sub DTOs ---
export class JobLocationDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() remoteType?: string; // onsite|hybrid|remote
}

export class JobSkillDto {
  @IsString() name: string;
  @IsOptional() @IsString() level?: string;
}

export class PreScreenQuestionDto {
  @IsString() q: string;
  @IsOptional() @IsString() type?: string; // text/number/single-choice
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
}

export class RecruiterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

// --- Main CreateJobDto ---
export class CreateJobDto {
  // required
  @IsString()
  companyId: string;

  @IsString()
  title: string;

  // optional core/meta
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() status?: "draft" | "published" | "closed";
  @IsOptional() @IsString() visibility?: "public" | "private" | "unlisted";

  // company info
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsUrl() companyLogoUrl?: string;
  @IsOptional() @IsUrl() companyWebsite?: string;
  @IsOptional() @IsString() companyLocation?: string;
  @IsOptional() @IsString() companySize?: string;
  @IsOptional() @IsString() companyIndustry?: string;

  // role & location
  @IsOptional()
  @ValidateNested()
  @Type(() => JobLocationDto)
  location?: JobLocationDto;
  @IsOptional() @IsArray() @IsString({ each: true }) employmentType?: string[]; // fulltime,...
  @IsOptional() @IsString() seniority?: string;
  @IsOptional() @IsNumber() teamSize?: number;
  @IsOptional() @IsString() department?: string;

  // description & requirements
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) requirements?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) niceToHave?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobSkillDto)
  skills?: JobSkillDto[];

  @IsOptional() @IsNumber() experienceYears?: number;
  @IsOptional() @IsString() educationLevel?: string;

  // compensation & benefits
  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  salary?: { min?: number; max?: number; currency?: string; period?: string };

  @IsOptional() @IsArray() @IsString({ each: true }) benefits?: string[];
  @IsOptional() @IsString() bonus?: string;
  @IsOptional() @IsString() equity?: string;

  // application info
  @IsOptional() @IsUrl() applyUrl?: string;
  @IsOptional() @IsString() applyEmail?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => RecruiterDto)
  recruiter?: RecruiterDto;
  @IsOptional() @IsString() howToApply?: string;
  @IsOptional() @IsDateString() applicationDeadline?: string;

  // tags & metadata
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsBoolean() remote?: boolean;

  // screening / ATS
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreScreenQuestionDto)
  preScreenQuestions?: PreScreenQuestionDto[];

  @IsOptional() @IsArray() @IsString({ each: true }) requiredDocs?: string[];

  // admin fields
  @IsOptional() @IsString() publishedBy?: string;
  @IsOptional() @IsString() approvedBy?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsNumber() version?: number;
}
