import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Req,
  Get,
  Query,
  Param,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
} from "@nestjs/common";
import { JobService } from "./job.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { UpdateJobDto } from "./dto/update-job.dto";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
// import { RagService } from "../rag/rag.service";

@Controller("jobs")
export class JobController {
  constructor(
    private readonly jobService: JobService,
    // private readonly ragService: RagService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  )
  async create(@Body() dto: CreateJobDto, @Req() req: any) {
    const userId = req.user?.userId;
    return this.jobService.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("user/me")
  async getMyJobs(@Req() req: any) {
    const userId = req.user?.userId;
    return this.jobService.findByUser(userId);
  }

  @Get()
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("companyId") companyId?: string,
    @Query("userId") userId?: string, // thêm để filter theo user (createdBy)
    @Query("search") search?: string, // search keyword
    @Query("sort") sort?: string, // latest | oldest
  ) {
    const filters: any = {};
    if (companyId) filters.companyId = companyId;
    if (userId) filters.createdBy = userId; // map userId -> createdBy
    // bạn có thể add các filters khác tại đây nếu cần

    return this.jobService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      filters,
      search,
      sort,
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @Query("populate") populate?: string) {
    const populateCreator = populate === "creator";
    return this.jobService.findOne(id, populateCreator);
  }

  @Put(":id")
  @UseGuards(JwtAuthGuard)
  async update(@Param("id") id: string, @Body() payload: UpdateJobDto) {
    return this.jobService.update(id, payload);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.jobService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/rename")
  async rename(@Param("id") id: string, @Body("title") title: string) {
    return this.jobService.rename(id, title);
  }

  // @Get(":id/match-cvs")
  // async matchCvs(
  //   @Param("id") id: string,
  //   @Query("topK") topK?: string,
  //   @Query("page") page?: string,
  //   @Query("limit") limit?: string,
  //   @Query("sort") sort?: string, // "best" | "worst"
  // ) {
  //   const parsedSort: "best" | "worst" = sort === "worst" ? "worst" : "best";

  //   return this.jobService.matchCvs(
  //     id,
  //     topK ? parseInt(topK, 10) : 50,
  //     page ? parseInt(page, 10) : 1,
  //     limit ? parseInt(limit, 10) : 10,
  //     parsedSort,
  //   );
  // }

  // @Get(":id/match-cvs")
  // async matchCvs(@Param("id") id: string, @Query("topK") topK?: string) {
  //   return this.ragService.matchCvsForJob(id, topK ? parseInt(topK) : 20);
  // }
}
