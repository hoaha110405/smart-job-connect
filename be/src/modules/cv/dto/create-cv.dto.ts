import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  IsUrl,
} from "class-validator";
import { Type } from "class-transformer";

export class FileDto {
  @IsOptional() @IsString() filename?: string;
  @IsOptional() @IsString() originalname?: string;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() mimetype?: string;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() @IsDateString() uploadedAt?: string; // dùng string ISO cho dễ validate
}

// -------- Sub DTOs --------

export class LocationDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
}

export class SkillDto {
  @IsString() name: string;
  @IsOptional() @IsString() level?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() years?: number;
}

export class ExperienceDto {
  @IsOptional() @IsString() id?: string;
  @IsString() title: string;
  @IsString() company: string;
  @IsOptional() @IsUrl() companyWebsite?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() isCurrent?: boolean;
  @IsOptional() @IsString() employmentType?: string;
  @IsOptional() @IsNumber() teamSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) achievements?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class EducationDto {
  @IsString() degree: string;
  @IsString() major: string;
  @IsString() school: string;

  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() gpa?: string;
}

export class ProjectDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() role?: string;

  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) techStack?: string[];
  @IsOptional() @IsUrl() url?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) metrics?: string[];
}

export class CertificationDto {
  @IsString() name: string;
  @IsString() issuer: string;
  @IsDateString() issueDate: string;

  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsUrl() credentialUrl?: string;
}

export class LanguageDto {
  @IsString() name: string;
  @IsString() level: string;
}

export class PortfolioItemDto {
  @IsString() type: string;
  @IsString() url: string;
  @IsOptional() @IsString() description?: string;
}

export class ReferenceDto {
  @IsString() name: string;
  @IsOptional() @IsString() relation?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() note?: string;
}

// -------- Main CreateCvDto --------

export class CreateCvDto {
  // Required
  // @IsString()
  // userId: string;

  @IsString()
  fullname: string;

  // Optional main info
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() summary?: string;

  // Target job
  @IsOptional() @IsString() targetRole?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employmentType?: string[];

  @IsOptional() @IsString() salaryExpectation?: string;
  @IsOptional() @IsString() availability?: string;

  // Skills
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills?: SkillDto[];

  // Experiences
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experiences?: ExperienceDto[];

  // Education
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  // Projects
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  projects?: ProjectDto[];

  // Certifications
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificationDto)
  certifications?: CertificationDto[];

  // Languages
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LanguageDto)
  languages?: LanguageDto[];

  // Portfolio
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioItemDto)
  portfolio?: PortfolioItemDto[];

  // References
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references?: ReferenceDto[];

  // Tags
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // ---- Thêm field file ----
  @IsOptional()
  @ValidateNested()
  @Type(() => FileDto)
  file?: FileDto;
}
