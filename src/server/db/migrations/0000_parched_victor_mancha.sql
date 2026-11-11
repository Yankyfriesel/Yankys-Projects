CREATE TYPE "public"."box_source" AS ENUM('production', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('desktop', 'phone');--> statement-breakpoint
CREATE TYPE "public"."label_type" AS ENUM('item', 'box', 'pallet', 'shipping');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('he', 'en');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('question', 'request', 'problem', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('new', 'done');--> statement-breakpoint
CREATE TYPE "public"."priority_doc_type" AS ENUM('production', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"user_display" text NOT NULL,
	"device_type" "device_type",
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "admin_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender_id" text,
	"sender_display" text NOT NULL,
	"kind" "message_kind" NOT NULL,
	"screen" text NOT NULL,
	"subject" text NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"details" text NOT NULL,
	"page_path" text DEFAULT '' NOT NULL,
	"device_type" "device_type",
	"locale" "locale" DEFAULT 'he' NOT NULL,
	"status" "message_status" DEFAULT 'new' NOT NULL,
	"handled_by" text,
	"handled_by_display" text,
	"handled_at" timestamp with time zone,
	"reply" text
);
--> statement-breakpoint
CREATE TABLE "box_counters" (
	"item_digits" text PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boxes" (
	"id" text PRIMARY KEY NOT NULL,
	"barcode" text NOT NULL,
	"source" "box_source" NOT NULL,
	"item_number" text NOT NULL,
	"running" text NOT NULL,
	"slaughter_date" date NOT NULL,
	"production_date" date,
	"expiry_date" date NOT NULL,
	"certificate_no" text,
	"weight_kg" numeric(6, 2) NOT NULL,
	"docno" text NOT NULL,
	"warehouse_code" text NOT NULL,
	"received_by" text,
	"received_by_display" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boxes_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "fake_priority_inventory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"partname" text NOT NULL,
	"warhsname" text NOT NULL,
	"actname" text NOT NULL,
	"tbalance" numeric(10, 2) NOT NULL,
	"tunitname" text DEFAULT 'ק"ג' NOT NULL,
	"expirydate" date NOT NULL,
	"curdate" date NOT NULL,
	CONSTRAINT "fake_priority_inventory_actname_unique" UNIQUE("actname")
);
--> statement-breakpoint
CREATE TABLE "fake_priority_items" (
	"partname" text PRIMARY KEY NOT NULL,
	"partdes" text NOT NULL,
	"epartdes" text DEFAULT '' NOT NULL,
	"barcode" text DEFAULT '' NOT NULL,
	"familydes" text DEFAULT '' NOT NULL,
	"weight" numeric(10, 2),
	"expiredays" integer DEFAULT 0 NOT NULL,
	"specs" text DEFAULT '' NOT NULL,
	"packingcode" text DEFAULT '' NOT NULL,
	"originname" text DEFAULT '' NOT NULL,
	"inventorymanaged" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fake_priority_orders" (
	"docno" text PRIMARY KEY NOT NULL,
	"doctype" "priority_doc_type" DEFAULT 'production' NOT NULL,
	"partname" text,
	"curdate" date NOT NULL,
	"quant" numeric(10, 2),
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fake_priority_received_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"docno" text NOT NULL,
	"topalletname" text NOT NULL,
	"tquant" numeric(10, 2) NOT NULL,
	"partname" text NOT NULL,
	"barcode" text DEFAULT '' NOT NULL,
	"pdes" text DEFAULT '' NOT NULL,
	"topp_expirydate" date NOT NULL,
	"warhsname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fake_priority_received_lines_topalletname_unique" UNIQUE("topalletname")
);
--> statement-breakpoint
CREATE TABLE "fake_priority_warehouses" (
	"warhsname" text PRIMARY KEY NOT NULL,
	"warhsdes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label_category_defaults" (
	"category" text PRIMARY KEY NOT NULL,
	"layout_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label_layouts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "label_type" NOT NULL,
	"width_mm" numeric(6, 1) NOT NULL,
	"height_mm" numeric(6, 1) NOT NULL,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pallet_boxes" (
	"pallet_number" bigint NOT NULL,
	"barcode" text NOT NULL,
	"item_number" text NOT NULL,
	"item_name" text NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "pallet_boxes_pallet_number_barcode_pk" PRIMARY KEY("pallet_number","barcode")
);
--> statement-breakpoint
CREATE TABLE "pallets" (
	"number" bigserial PRIMARY KEY NOT NULL,
	"created_by" text,
	"created_by_display" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priority_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"barcode" text NOT NULL,
	"from_warehouse" text NOT NULL,
	"to_warehouse" text NOT NULL,
	"status" "send_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" text,
	"created_by_display" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priority_sends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"box_id" text NOT NULL,
	"status" "send_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "priority_sends_boxId_unique" UNIQUE("box_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_type" "device_type" DEFAULT 'desktop' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "shipping_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_number" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"ship_date" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"label_count" integer,
	"raw" jsonb,
	"is_test" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"times_received" integer DEFAULT 1 NOT NULL,
	"last_printed_at" timestamp with time zone,
	"last_printed_by" text,
	"times_printed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"image" text,
	"locale" "locale" DEFAULT 'he' NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_inventory" ADD CONSTRAINT "fake_priority_inventory_partname_fake_priority_items_partname_fk" FOREIGN KEY ("partname") REFERENCES "public"."fake_priority_items"("partname") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_inventory" ADD CONSTRAINT "fake_priority_inventory_warhsname_fake_priority_warehouses_warhsname_fk" FOREIGN KEY ("warhsname") REFERENCES "public"."fake_priority_warehouses"("warhsname") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_orders" ADD CONSTRAINT "fake_priority_orders_partname_fake_priority_items_partname_fk" FOREIGN KEY ("partname") REFERENCES "public"."fake_priority_items"("partname") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_received_lines" ADD CONSTRAINT "fake_priority_received_lines_docno_fake_priority_orders_docno_fk" FOREIGN KEY ("docno") REFERENCES "public"."fake_priority_orders"("docno") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_received_lines" ADD CONSTRAINT "fake_priority_received_lines_partname_fake_priority_items_partname_fk" FOREIGN KEY ("partname") REFERENCES "public"."fake_priority_items"("partname") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_priority_received_lines" ADD CONSTRAINT "fake_priority_received_lines_warhsname_fake_priority_warehouses_warhsname_fk" FOREIGN KEY ("warhsname") REFERENCES "public"."fake_priority_warehouses"("warhsname") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_category_defaults" ADD CONSTRAINT "label_category_defaults_layout_id_label_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."label_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_boxes" ADD CONSTRAINT "pallet_boxes_pallet_number_pallets_number_fk" FOREIGN KEY ("pallet_number") REFERENCES "public"."pallets"("number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_moves" ADD CONSTRAINT "priority_moves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_sends" ADD CONSTRAINT "priority_sends_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_log_at_idx" ON "activity_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "activity_log_user_id_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_log_action_idx" ON "activity_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_messages_status_idx" ON "admin_messages" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "admin_messages_sender_idx" ON "admin_messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "boxes_received_at_idx" ON "boxes" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "boxes_item_idx" ON "boxes" USING btree ("item_number");--> statement-breakpoint
CREATE INDEX "fake_priority_inventory_partname_idx" ON "fake_priority_inventory" USING btree ("partname");--> statement-breakpoint
CREATE INDEX "fake_priority_inventory_warhsname_idx" ON "fake_priority_inventory" USING btree ("warhsname");--> statement-breakpoint
CREATE UNIQUE INDEX "label_layouts_name_idx" ON "label_layouts" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "pallet_boxes_barcode_idx" ON "pallet_boxes" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "priority_moves_status_idx" ON "priority_moves" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "priority_moves_barcode_idx" ON "priority_moves" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "priority_sends_status_idx" ON "priority_sends" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_orders_number_idx" ON "shipping_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "shipping_orders_received_idx" ON "shipping_orders" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "two_factors_user_id_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");