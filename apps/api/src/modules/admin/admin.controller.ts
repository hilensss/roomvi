import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminService } from './admin.service.js';
import { AdminGenerationsQueryDto } from './dto/admin-generations-query.dto.js';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto.js';
import { AdminPaginationQueryDto } from './dto/admin-pagination-query.dto.js';
import { AdminProductsQueryDto } from './dto/admin-products-query.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { UpdateManagerCommentDto } from './dto/update-manager-comment.dto.js';
import { UpdateOrderItemProcurementStatusDto } from './dto/update-order-item-procurement-status.dto.js';
import { UpdateProductAdminDto } from './dto/update-product-admin.dto.js';
import { UpdateSupplierOrderStatusDto } from './dto/update-supplier-order-status.dto.js';
import { AdminGuard } from './guards/admin.guard.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('orders')
  async findOrders(@Query() query: AdminOrdersQueryDto) {
    return this.adminService.findOrders(query);
  }

  @Get('orders/:id')
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id);
  }

  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(id, dto);
  }

  @Patch('orders/:id/manager-comment')
  async updateOrderManagerComment(
    @Param('id') id: string,
    @Body() dto: UpdateManagerCommentDto,
  ) {
    return this.adminService.updateOrderManagerComment(id, dto);
  }

  @Patch('orders/:id/items/:itemId/procurement-status')
  async updateOrderItemProcurementStatus(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemProcurementStatusDto,
  ) {
    return this.adminService.updateOrderItemProcurementStatus(id, itemId, dto);
  }

  @Patch('orders/:id/items/:itemId/manager-comment')
  async updateOrderItemManagerComment(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateManagerCommentDto,
  ) {
    return this.adminService.updateOrderItemManagerComment(id, itemId, dto);
  }

  @Get('supplier-orders')
  async findSupplierOrders(@Query() query: AdminPaginationQueryDto) {
    return this.adminService.findSupplierOrders(query);
  }

  @Patch('supplier-orders/:id/status')
  async updateSupplierOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierOrderStatusDto,
  ) {
    return this.adminService.updateSupplierOrderStatus(id, dto);
  }

  @Get('generations')
  async findGenerationJobs(@Query() query: AdminGenerationsQueryDto) {
    return this.adminService.findGenerationJobs(query);
  }

  @Get('generations/:id')
  async getGenerationJobById(@Param('id') id: string) {
    return this.adminService.getGenerationJobById(id);
  }

  @Get('products')
  async findProducts(@Query() query: AdminProductsQueryDto) {
    return this.adminService.findProducts(query);
  }

  @Patch('products/:id')
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductAdminDto,
  ) {
    return this.adminService.updateProduct(id, dto);
  }
}
