
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accounts": {
                  Row: {
                    "active": boolean,"allow_posting": boolean,"code": string,"is_auxiliary": boolean,"label": string,"type": string
                  }
                  Insert: {
                    "active"?: boolean,"allow_posting"?: boolean,"code": string,"is_auxiliary"?: boolean,"label": string,"type": string
                  }
                  Update: {
                    "active"?: boolean,"allow_posting"?: boolean,"code"?: string,"is_auxiliary"?: boolean,"label"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"alerts": {
                  Row: {
                    "created_at": string,"dedupe_key": string | null,"details": NonNullable<Json>,"dossier_id": string | null,"id": string,"kind": string,"owner_id": string | null,"resolution_note": string | null,"resolved_by": string | null,"service_id": string | null,"severity": string,"status": string,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"dedupe_key"?: string | null,"details"?: NonNullable<Json>,"dossier_id"?: string | null,"id"?: string,"kind": string,"owner_id"?: string | null,"resolution_note"?: string | null,"resolved_by"?: string | null,"service_id"?: string | null,"severity"?: string,"status"?: string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string | null,"details"?: NonNullable<Json>,"dossier_id"?: string | null,"id"?: string,"kind"?: string,"owner_id"?: string | null,"resolution_note"?: string | null,"resolved_by"?: string | null,"service_id"?: string | null,"severity"?: string,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alerts_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "alerts_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alerts_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "alerts_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alerts_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"api_call_logs": {
                  Row: {
                    "actor_id": string | null,"connector_code": string,"created_at": string,"duration_ms": number | null,"error_message": string | null,"id": number,"operation": string,"request_id": string | null,"request_summary": Json | null,"response_summary": Json | null,"status": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"connector_code": string,"created_at"?: string,"duration_ms"?: number | null,"error_message"?: string | null,"id"?: never,"operation": string,"request_id"?: string | null,"request_summary"?: Json | null,"response_summary"?: Json | null,"status": string
                  }
                  Update: {
                    "actor_id"?: string | null,"connector_code"?: string,"created_at"?: string,"duration_ms"?: number | null,"error_message"?: string | null,"id"?: never,"operation"?: string,"request_id"?: string | null,"request_summary"?: Json | null,"response_summary"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_call_logs_connector_code_fkey"
      columns: ["connector_code"]
isOneToOne: false
      referencedRelation: "integration_connectors"
      referencedColumns: ["code"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "description": string | null,"is_public": boolean,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "description"?: string | null,"is_public"?: boolean,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"is_public"?: boolean,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"changed": Json | null,"created_at": string,"id": number,"new_values": Json | null,"old_values": Json | null,"reason": string | null,"record_id": string | null,"table_name": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"changed"?: Json | null,"created_at"?: string,"id"?: never,"new_values"?: Json | null,"old_values"?: Json | null,"reason"?: string | null,"record_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"changed"?: Json | null,"created_at"?: string,"id"?: never,"new_values"?: Json | null,"old_values"?: Json | null,"reason"?: string | null,"record_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cash_closings": {
                  Row: {
                    "closed_by": string | null,"closing_date": string,"counted_balance": number,"created_at": string,"difference": number | null,"expected_balance": number,"id": string,"justification": string | null,"treasury_account_id": string
                  }
                  Insert: {
                    "closed_by"?: string | null,"closing_date": string,"counted_balance": number,"created_at"?: string,"difference"?: never,"expected_balance": number,"id"?: string,"justification"?: string | null,"treasury_account_id": string
                  }
                  Update: {
                    "closed_by"?: string | null,"closing_date"?: string,"counted_balance"?: number,"created_at"?: string,"difference"?: never,"expected_balance"?: number,"id"?: string,"justification"?: string | null,"treasury_account_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_closings_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_closings_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_balances"
      referencedColumns: ["id"]
    }
                  ]
                },"client_accounts": {
                  Row: {
                    "client_id": string,"created_at": string,"user_id": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_accounts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "client_accounts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"client_contacts": {
                  Row: {
                    "client_id": string,"created_at": string,"email": string | null,"full_name": string,"id": string,"is_decision_maker": boolean,"phone": string | null,"role": string | null
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"is_decision_maker"?: boolean,"phone"?: string | null,"role"?: string | null
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"is_decision_maker"?: boolean,"phone"?: string | null,"role"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_contacts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "client_contacts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"city": string | null,"commercial_terms": string | null,"company_name": string | null,"consents": NonNullable<Json>,"country": string | null,"created_at": string,"display_name": string | null,"email": string | null,"first_name": string | null,"id": string,"kind": Database["public"]['Enums']["client_kind"],"language": string,"last_name": string | null,"merged_into_id": string | null,"notes": string | null,"owner_id": string | null,"phone": string | null,"source": Database["public"]['Enums']["lead_source"],"tax_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"city"?: string | null,"commercial_terms"?: string | null,"company_name"?: string | null,"consents"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"display_name"?: never,"email"?: string | null,"first_name"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["client_kind"],"language"?: string,"last_name"?: string | null,"merged_into_id"?: string | null,"notes"?: string | null,"owner_id"?: string | null,"phone"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"tax_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"city"?: string | null,"commercial_terms"?: string | null,"company_name"?: string | null,"consents"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"display_name"?: never,"email"?: string | null,"first_name"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["client_kind"],"language"?: string,"last_name"?: string | null,"merged_into_id"?: string | null,"notes"?: string | null,"owner_id"?: string | null,"phone"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"tax_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_merged_into_id_fkey"
      columns: ["merged_into_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clients_merged_into_id_fkey"
      columns: ["merged_into_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_allocations": {
                  Row: {
                    "amount": number,"amount_tnd": number,"basis": NonNullable<Json>,"cost_kind": string,"created_at": string,"created_by": string | null,"departure_id": string | null,"dossier_id": string | null,"id": string,"method": string,"service_id": string | null,"status": string,"supplier_invoice_id": string,"supplier_invoice_line_id": string | null
                  }
                  Insert: {
                    "amount": number,"amount_tnd": number,"basis"?: NonNullable<Json>,"cost_kind"?: string,"created_at"?: string,"created_by"?: string | null,"departure_id"?: string | null,"dossier_id"?: string | null,"id"?: string,"method": string,"service_id"?: string | null,"status"?: string,"supplier_invoice_id": string,"supplier_invoice_line_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"amount_tnd"?: number,"basis"?: NonNullable<Json>,"cost_kind"?: string,"created_at"?: string,"created_by"?: string | null,"departure_id"?: string | null,"dossier_id"?: string | null,"id"?: string,"method"?: string,"service_id"?: string | null,"status"?: string,"supplier_invoice_id"?: string,"supplier_invoice_line_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_allocations_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "cost_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "cost_allocations_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_supplier_invoice_id_fkey"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoice_balances"
      referencedColumns: ["supplier_invoice_id"]
    },{
      foreignKeyName: "cost_allocations_supplier_invoice_id_fkey"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_allocations_supplier_invoice_line_id_fkey"
      columns: ["supplier_invoice_line_id"]
isOneToOne: false
      referencedRelation: "supplier_invoice_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"departure_holds": {
                  Row: {
                    "created_at": string,"created_by": string | null,"departure_id": string,"dossier_id": string | null,"expires_at": string | null,"id": string,"kind": string,"lead_id": string | null,"released_at": string | null,"seats": number,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"departure_id": string,"dossier_id"?: string | null,"expires_at"?: string | null,"id"?: string,"kind": string,"lead_id"?: string | null,"released_at"?: string | null,"seats": number,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"departure_id"?: string,"dossier_id"?: string | null,"expires_at"?: string | null,"id"?: string,"kind"?: string,"lead_id"?: string | null,"released_at"?: string | null,"seats"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departure_holds_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "departure_holds_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "departure_holds_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "departure_holds_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "departure_holds_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "departure_holds_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"departures": {
                  Row: {
                    "allotments": NonNullable<Json>,"booking_deadline": string | null,"capacity": number,"code": string,"created_at": string,"currency": string,"deposit_amount": number | null,"end_date": string,"guide_notes": string | null,"id": string,"min_participants": number | null,"offer_id": string,"option_hold_hours": number,"price_adult": number | null,"price_child": number | null,"price_infant": number | null,"seats_confirmed": number,"seats_on_option": number,"single_supplement": number | null,"start_date": string,"status": Database["public"]['Enums']["departure_status"],"supplier_option_deadline": string | null,"updated_at": string
                  }
                  Insert: {
                    "allotments"?: NonNullable<Json>,"booking_deadline"?: string | null,"capacity": number,"code": string,"created_at"?: string,"currency"?: string,"deposit_amount"?: number | null,"end_date": string,"guide_notes"?: string | null,"id"?: string,"min_participants"?: number | null,"offer_id": string,"option_hold_hours"?: number,"price_adult"?: number | null,"price_child"?: number | null,"price_infant"?: number | null,"seats_confirmed"?: number,"seats_on_option"?: number,"single_supplement"?: number | null,"start_date": string,"status"?: Database["public"]['Enums']["departure_status"],"supplier_option_deadline"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allotments"?: NonNullable<Json>,"booking_deadline"?: string | null,"capacity"?: number,"code"?: string,"created_at"?: string,"currency"?: string,"deposit_amount"?: number | null,"end_date"?: string,"guide_notes"?: string | null,"id"?: string,"min_participants"?: number | null,"offer_id"?: string,"option_hold_hours"?: number,"price_adult"?: number | null,"price_child"?: number | null,"price_infant"?: number | null,"seats_confirmed"?: number,"seats_on_option"?: number,"single_supplement"?: number | null,"start_date"?: string,"status"?: Database["public"]['Enums']["departure_status"],"supplier_option_deadline"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departures_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "departures_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "site_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"deposit_slips": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deposit_date": string,"id": string,"reference": string,"total_amount": number,"treasury_account_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deposit_date"?: string,"id"?: string,"reference"?: string,"total_amount"?: number,"treasury_account_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deposit_date"?: string,"id"?: string,"reference"?: string,"total_amount"?: number,"treasury_account_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deposit_slips_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deposit_slips_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_balances"
      referencedColumns: ["id"]
    }
                  ]
                },"document_access_log": {
                  Row: {
                    "action": string,"created_at": string,"document_id": string,"id": number,"user_id": string | null
                  }
                  Insert: {
                    "action": string,"created_at"?: string,"document_id": string,"id"?: never,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"document_id"?: string,"id"?: never,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_access_log_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "client_id": string | null,"created_at": string,"dossier_id": string | null,"id": string,"kind": Database["public"]['Enums']["document_kind"],"mime_type": string,"published_to_client": boolean,"sensitive": boolean,"service_id": string | null,"size_bytes": number,"storage_path": string,"supplier_id": string | null,"title": string,"traveller_id": string | null,"uploaded_by": string | null,"uploaded_via": string,"can_read_document": boolean | null
                  }
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"dossier_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["document_kind"],"mime_type": string,"published_to_client"?: boolean,"sensitive"?: boolean,"service_id"?: string | null,"size_bytes": number,"storage_path": string,"supplier_id"?: string | null,"title": string,"traveller_id"?: string | null,"uploaded_by"?: string | null,"uploaded_via"?: string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"dossier_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["document_kind"],"mime_type"?: string,"published_to_client"?: boolean,"sensitive"?: boolean,"service_id"?: string | null,"size_bytes"?: number,"storage_path"?: string,"supplier_id"?: string | null,"title"?: string,"traveller_id"?: string | null,"uploaded_by"?: string | null,"uploaded_via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "documents_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "documents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "documents_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_traveller_id_fkey"
      columns: ["traveller_id"]
isOneToOne: false
      referencedRelation: "travellers"
      referencedColumns: ["id"]
    }
                  ]
                },"dossier_checks": {
                  Row: {
                    "category": string,"code": string,"dossier_id": string,"id": string,"label": string,"note": string | null,"owner_id": string | null,"proof_document_id": string | null,"service_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "category": string,"code": string,"dossier_id": string,"id"?: string,"label": string,"note"?: string | null,"owner_id"?: string | null,"proof_document_id"?: string | null,"service_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"code"?: string,"dossier_id"?: string,"id"?: string,"label"?: string,"note"?: string | null,"owner_id"?: string | null,"proof_document_id"?: string | null,"service_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dossier_checks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "dossier_checks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossier_checks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "dossier_checks_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossier_checks_proof_document_id_fkey"
      columns: ["proof_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossier_checks_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"dossier_travellers": {
                  Row: {
                    "dossier_id": string,"is_lead": boolean,"room_label": string | null,"special_requests": string | null,"traveller_id": string
                  }
                  Insert: {
                    "dossier_id": string,"is_lead"?: boolean,"room_label"?: string | null,"special_requests"?: string | null,"traveller_id": string
                  }
                  Update: {
                    "dossier_id"?: string,"is_lead"?: boolean,"room_label"?: string | null,"special_requests"?: string | null,"traveller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dossier_travellers_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "dossier_travellers_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossier_travellers_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "dossier_travellers_traveller_id_fkey"
      columns: ["traveller_id"]
isOneToOne: false
      referencedRelation: "travellers"
      referencedColumns: ["id"]
    }
                  ]
                },"dossiers": {
                  Row: {
                    "accepted_version_id": string | null,"activity": Database["public"]['Enums']["activity"],"adults": number,"cancelled_reason": string | null,"children": number,"client_id": string,"created_at": string,"currency": string,"departure_id": string | null,"derogation_at": string | null,"derogation_by": string | null,"derogation_reason": string | null,"destination": string | null,"end_date": string | null,"financial_close_note": string | null,"financial_closed_at": string | null,"financial_closed_by": string | null,"financial_status": string,"id": string,"infants": number,"is_omra": boolean,"lead_id": string | null,"notes": string | null,"owner_id": string | null,"quote_id": string | null,"reference": string,"start_date": string | null,"status": Database["public"]['Enums']["dossier_status"],"title": string,"total_price": number,"updated_at": string
                  }
                  Insert: {
                    "accepted_version_id"?: string | null,"activity": Database["public"]['Enums']["activity"],"adults"?: number,"cancelled_reason"?: string | null,"children"?: number,"client_id": string,"created_at"?: string,"currency"?: string,"departure_id"?: string | null,"derogation_at"?: string | null,"derogation_by"?: string | null,"derogation_reason"?: string | null,"destination"?: string | null,"end_date"?: string | null,"financial_close_note"?: string | null,"financial_closed_at"?: string | null,"financial_closed_by"?: string | null,"financial_status"?: string,"id"?: string,"infants"?: number,"is_omra"?: boolean,"lead_id"?: string | null,"notes"?: string | null,"owner_id"?: string | null,"quote_id"?: string | null,"reference"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["dossier_status"],"title": string,"total_price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "accepted_version_id"?: string | null,"activity"?: Database["public"]['Enums']["activity"],"adults"?: number,"cancelled_reason"?: string | null,"children"?: number,"client_id"?: string,"created_at"?: string,"currency"?: string,"departure_id"?: string | null,"derogation_at"?: string | null,"derogation_by"?: string | null,"derogation_reason"?: string | null,"destination"?: string | null,"end_date"?: string | null,"financial_close_note"?: string | null,"financial_closed_at"?: string | null,"financial_closed_by"?: string | null,"financial_status"?: string,"id"?: string,"infants"?: number,"is_omra"?: boolean,"lead_id"?: string | null,"notes"?: string | null,"owner_id"?: string | null,"quote_id"?: string | null,"reference"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["dossier_status"],"title"?: string,"total_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dossiers_accepted_version_id_fkey"
      columns: ["accepted_version_id"]
isOneToOne: false
      referencedRelation: "quote_version_totals"
      referencedColumns: ["version_id"]
    },{
      foreignKeyName: "dossiers_accepted_version_id_fkey"
      columns: ["accepted_version_id"]
isOneToOne: false
      referencedRelation: "quote_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "dossiers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_derogation_by_fkey"
      columns: ["derogation_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_financial_closed_by_fkey"
      columns: ["financial_closed_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: true
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    }
                  ]
                },"event_participants": {
                  Row: {
                    "arrival_at": string | null,"attendance": string,"company": string | null,"constraints": string | null,"created_at": string,"departure_at": string | null,"dossier_id": string,"email": string | null,"full_name": string,"group_label": string | null,"id": string,"phone": string | null,"room_needs": string | null
                  }
                  Insert: {
                    "arrival_at"?: string | null,"attendance"?: string,"company"?: string | null,"constraints"?: string | null,"created_at"?: string,"departure_at"?: string | null,"dossier_id": string,"email"?: string | null,"full_name": string,"group_label"?: string | null,"id"?: string,"phone"?: string | null,"room_needs"?: string | null
                  }
                  Update: {
                    "arrival_at"?: string | null,"attendance"?: string,"company"?: string | null,"constraints"?: string | null,"created_at"?: string,"departure_at"?: string | null,"dossier_id"?: string,"email"?: string | null,"full_name"?: string,"group_label"?: string | null,"id"?: string,"phone"?: string | null,"room_needs"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_participants_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "event_participants_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_participants_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    }
                  ]
                },"external_deadlines": {
                  Row: {
                    "created_at": string,"dossier_id": string,"due_at": string | null,"id": string,"kind": string,"label": string,"needs_recheck": boolean,"received_at": string | null,"service_id": string | null,"source": string | null,"source_note": string | null,"status": string,"timezone": string
                  }
                  Insert: {
                    "created_at"?: string,"dossier_id": string,"due_at"?: string | null,"id"?: string,"kind": string,"label": string,"needs_recheck"?: boolean,"received_at"?: string | null,"service_id"?: string | null,"source"?: string | null,"source_note"?: string | null,"status"?: string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"dossier_id"?: string,"due_at"?: string | null,"id"?: string,"kind"?: string,"label"?: string,"needs_recheck"?: boolean,"received_at"?: string | null,"service_id"?: string | null,"source"?: string | null,"source_note"?: string | null,"status"?: string,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_deadlines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "external_deadlines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_deadlines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "external_deadlines_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"external_records": {
                  Row: {
                    "created_at": string,"external_key": string,"first_batch_id": string | null,"history": NonNullable<Json>,"id": string,"kind": string,"last_batch_id": string | null,"last_data": NonNullable<Json>,"platform": string,"service_id": string | null,"ticket_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"external_key": string,"first_batch_id"?: string | null,"history"?: NonNullable<Json>,"id"?: string,"kind": string,"last_batch_id"?: string | null,"last_data": NonNullable<Json>,"platform": string,"service_id"?: string | null,"ticket_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"external_key"?: string,"first_batch_id"?: string | null,"history"?: NonNullable<Json>,"id"?: string,"kind"?: string,"last_batch_id"?: string | null,"last_data"?: NonNullable<Json>,"platform"?: string,"service_id"?: string | null,"ticket_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_records_first_batch_id_fkey"
      columns: ["first_batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_records_last_batch_id_fkey"
      columns: ["last_batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_records_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_records_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"fiscal_periods": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"end_date": string,"id": string,"label": string,"start_date": string,"status": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"end_date": string,"id"?: string,"label": string,"start_date": string,"status"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"end_date"?: string,"id"?: string,"label"?: string,"start_date"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"flight_segments": {
                  Row: {
                    "arrives_at": string,"arrives_tz": string,"baggage": string | null,"carrier": string,"departs_at": string,"departs_tz": string,"flight_number": string,"from_airport": string,"id": string,"pnr": string | null,"seq": number,"service_id": string,"to_airport": string
                  }
                  Insert: {
                    "arrives_at": string,"arrives_tz"?: string,"baggage"?: string | null,"carrier": string,"departs_at": string,"departs_tz"?: string,"flight_number": string,"from_airport": string,"id"?: string,"pnr"?: string | null,"seq"?: number,"service_id": string,"to_airport": string
                  }
                  Update: {
                    "arrives_at"?: string,"arrives_tz"?: string,"baggage"?: string | null,"carrier"?: string,"departs_at"?: string,"departs_tz"?: string,"flight_number"?: string,"from_airport"?: string,"id"?: string,"pnr"?: string | null,"seq"?: number,"service_id"?: string,"to_airport"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flight_segments_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"rate_date": string,"rate_to_tnd": number,"source": string
                  }
                  Insert: {
                    "created_at"?: string,"currency": string,"id"?: string,"rate_date": string,"rate_to_tnd": number,"source": string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"rate_date"?: string,"rate_to_tnd"?: number,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"hotel_booking_requests": {
                  Row: {
                    "amount": number | null,"attempts": number,"conditions": string | null,"connector_code": string,"created_at": string,"created_by": string | null,"currency": string | null,"dossier_id": string | null,"external_ref": string | null,"id": string,"last_error": string | null,"offer_snapshot": NonNullable<Json>,"provider_hotel_code": string,"request_id": string,"service_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "amount"?: number | null,"attempts"?: number,"conditions"?: string | null,"connector_code": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"dossier_id"?: string | null,"external_ref"?: string | null,"id"?: string,"last_error"?: string | null,"offer_snapshot": NonNullable<Json>,"provider_hotel_code": string,"request_id": string,"service_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number | null,"attempts"?: number,"conditions"?: string | null,"connector_code"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"dossier_id"?: string | null,"external_ref"?: string | null,"id"?: string,"last_error"?: string | null,"offer_snapshot"?: NonNullable<Json>,"provider_hotel_code"?: string,"request_id"?: string,"service_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hotel_booking_requests_connector_code_fkey"
      columns: ["connector_code"]
isOneToOne: false
      referencedRelation: "integration_connectors"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "hotel_booking_requests_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "hotel_booking_requests_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hotel_booking_requests_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "hotel_booking_requests_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"hotel_mappings": {
                  Row: {
                    "created_at": string,"hotel_id": string,"id": string,"provider": string,"provider_hotel_code": string,"provider_hotel_name": string | null,"status": string,"validated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"hotel_id": string,"id"?: string,"provider": string,"provider_hotel_code": string,"provider_hotel_name"?: string | null,"status"?: string,"validated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"hotel_id"?: string,"id"?: string,"provider"?: string,"provider_hotel_code"?: string,"provider_hotel_name"?: string | null,"status"?: string,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "hotel_mappings_hotel_id_fkey"
      columns: ["hotel_id"]
isOneToOne: false
      referencedRelation: "hotels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hotel_mappings_validated_by_fkey"
      columns: ["validated_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"hotel_rates": {
                  Row: {
                    "board": string,"child_discount_pct": number,"currency": string,"hotel_id": string,"id": string,"price_per_night": number,"rate_kind": string,"room_type": string,"season": string,"single_supplement": number,"valid_from": string,"valid_to": string
                  }
                  Insert: {
                    "board": string,"child_discount_pct"?: number,"currency"?: string,"hotel_id": string,"id"?: string,"price_per_night": number,"rate_kind"?: string,"room_type": string,"season": string,"single_supplement"?: number,"valid_from": string,"valid_to": string
                  }
                  Update: {
                    "board"?: string,"child_discount_pct"?: number,"currency"?: string,"hotel_id"?: string,"id"?: string,"price_per_night"?: number,"rate_kind"?: string,"room_type"?: string,"season"?: string,"single_supplement"?: number,"valid_from"?: string,"valid_to"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hotel_rates_hotel_id_fkey"
      columns: ["hotel_id"]
isOneToOne: false
      referencedRelation: "hotels"
      referencedColumns: ["id"]
    }
                  ]
                },"hotels": {
                  Row: {
                    "active": boolean,"address": string | null,"boards": (string)[],"category": number | null,"child_rules": string | null,"city": string,"country": string,"created_at": string,"id": string,"name": string,"room_types": (string)[],"supplier_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"boards"?: (string)[],"category"?: number | null,"child_rules"?: string | null,"city": string,"country"?: string,"created_at"?: string,"id"?: string,"name": string,"room_types"?: (string)[],"supplier_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"boards"?: (string)[],"category"?: number | null,"child_rules"?: string | null,"city"?: string,"country"?: string,"created_at"?: string,"id"?: string,"name"?: string,"room_types"?: (string)[],"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "hotels_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"import_batches": {
                  Row: {
                    "committed_at": string | null,"committed_by": string | null,"created_at": string,"created_by": string | null,"file_name": string,"file_sha256": string,"id": string,"kind": string,"platform": string,"source_document_id": string | null,"stats": NonNullable<Json>,"status": string,"template_id": string
                  }
                  Insert: {
                    "committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name": string,"file_sha256": string,"id"?: string,"kind": string,"platform": string,"source_document_id"?: string | null,"stats"?: NonNullable<Json>,"status"?: string,"template_id": string
                  }
                  Update: {
                    "committed_at"?: string | null,"committed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"file_name"?: string,"file_sha256"?: string,"id"?: string,"kind"?: string,"platform"?: string,"source_document_id"?: string | null,"stats"?: NonNullable<Json>,"status"?: string,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_batches_source_document_id_fkey"
      columns: ["source_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_batches_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "import_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"import_rows": {
                  Row: {
                    "applied_service_id": string | null,"batch_id": string,"candidate_dossier_ids": (string)[],"classification": string,"decision": string,"diff": Json | null,"errors": NonNullable<Json>,"external_key": string | null,"id": string,"normalized": Json | null,"raw": NonNullable<Json>,"row_number": number,"target_dossier_id": string | null
                  }
                  Insert: {
                    "applied_service_id"?: string | null,"batch_id": string,"candidate_dossier_ids"?: (string)[],"classification": string,"decision"?: string,"diff"?: Json | null,"errors"?: NonNullable<Json>,"external_key"?: string | null,"id"?: string,"normalized"?: Json | null,"raw": NonNullable<Json>,"row_number": number,"target_dossier_id"?: string | null
                  }
                  Update: {
                    "applied_service_id"?: string | null,"batch_id"?: string,"candidate_dossier_ids"?: (string)[],"classification"?: string,"decision"?: string,"diff"?: Json | null,"errors"?: NonNullable<Json>,"external_key"?: string | null,"id"?: string,"normalized"?: Json | null,"raw"?: NonNullable<Json>,"row_number"?: number,"target_dossier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_applied_service_id_fkey"
      columns: ["applied_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_target_dossier_id_fkey"
      columns: ["target_dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "import_rows_target_dossier_id_fkey"
      columns: ["target_dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_target_dossier_id_fkey"
      columns: ["target_dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    }
                  ]
                },"import_templates": {
                  Row: {
                    "active": boolean,"column_mapping": NonNullable<Json>,"created_at": string,"date_format": string,"delimiter": string,"encoding": string,"id": string,"kind": string,"label": string,"version": number
                  }
                  Insert: {
                    "active"?: boolean,"column_mapping": NonNullable<Json>,"created_at"?: string,"date_format"?: string,"delimiter"?: string,"encoding"?: string,"id"?: string,"kind": string,"label": string,"version": number
                  }
                  Update: {
                    "active"?: boolean,"column_mapping"?: NonNullable<Json>,"created_at"?: string,"date_format"?: string,"delimiter"?: string,"encoding"?: string,"id"?: string,"kind"?: string,"label"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"incidents": {
                  Row: {
                    "cost_impact": number | null,"created_at": string,"description": string | null,"dossier_id": string | null,"due_at": string | null,"id": string,"kind": string,"owner_id": string | null,"resolution": string | null,"status": string,"supplier_id": string | null,"title": string
                  }
                  Insert: {
                    "cost_impact"?: number | null,"created_at"?: string,"description"?: string | null,"dossier_id"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"owner_id"?: string | null,"resolution"?: string | null,"status"?: string,"supplier_id"?: string | null,"title": string
                  }
                  Update: {
                    "cost_impact"?: number | null,"created_at"?: string,"description"?: string | null,"dossier_id"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"owner_id"?: string | null,"resolution"?: string | null,"status"?: string,"supplier_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incidents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "incidents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "incidents_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidents_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connectors": {
                  Row: {
                    "capabilities": NonNullable<Json>,"code": string,"config": NonNullable<Json>,"enabled": boolean,"kind": string,"label": string,"mode": string,"notes": string | null,"updated_at": string
                  }
                  Insert: {
                    "capabilities"?: NonNullable<Json>,"code": string,"config"?: NonNullable<Json>,"enabled"?: boolean,"kind": string,"label": string,"mode"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "capabilities"?: NonNullable<Json>,"code"?: string,"config"?: NonNullable<Json>,"enabled"?: boolean,"kind"?: string,"label"?: string,"mode"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"interactions": {
                  Row: {
                    "author_id": string | null,"channel": string,"client_id": string | null,"direction": string | null,"dossier_id": string | null,"id": string,"lead_id": string | null,"occurred_at": string,"summary": string
                  }
                  Insert: {
                    "author_id"?: string | null,"channel"?: string,"client_id"?: string | null,"direction"?: string | null,"dossier_id"?: string | null,"id"?: string,"lead_id"?: string | null,"occurred_at"?: string,"summary": string
                  }
                  Update: {
                    "author_id"?: string | null,"channel"?: string,"client_id"?: string | null,"direction"?: string | null,"dossier_id"?: string | null,"id"?: string,"lead_id"?: string | null,"occurred_at"?: string,"summary"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interactions_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "interactions_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_dossier_fk"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "interactions_dossier_fk"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interactions_dossier_fk"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "interactions_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_lines": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"] | null,"description": string,"id": string,"invoice_id": string,"position": number,"quantity": number,"service_id": string | null,"tax_amount": number | null,"tax_code": string | null,"tax_rate": number,"total_ht": number | null,"unit_price": number
                  }
                  Insert: {
                    "activity"?: Database["public"]['Enums']["activity"] | null,"description": string,"id"?: string,"invoice_id": string,"position"?: number,"quantity"?: number,"service_id"?: string | null,"tax_amount"?: never,"tax_code"?: string | null,"tax_rate"?: number,"total_ht"?: never,"unit_price": number
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"] | null,"description"?: string,"id"?: string,"invoice_id"?: string,"position"?: number,"quantity"?: number,"service_id"?: string | null,"tax_amount"?: never,"tax_code"?: string | null,"tax_rate"?: number,"total_ht"?: never,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_lines_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoice_balances"
      referencedColumns: ["invoice_id"]
    },{
      foreignKeyName: "invoice_lines_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_lines_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"currency": string,"departure_id": string | null,"document_id": string | null,"dossier_id": string | null,"due_date": string | null,"id": string,"issue_date": string | null,"kind": Database["public"]['Enums']["invoice_kind"],"notes": string | null,"number": string | null,"original_invoice_id": string | null,"reason": string | null,"stamp_amount": number,"status": Database["public"]['Enums']["invoice_status"],"total_ht": number,"total_tax": number,"total_ttc": number,"validated_at": string | null,"validated_by": string | null
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"departure_id"?: string | null,"document_id"?: string | null,"dossier_id"?: string | null,"due_date"?: string | null,"id"?: string,"issue_date"?: string | null,"kind"?: Database["public"]['Enums']["invoice_kind"],"notes"?: string | null,"number"?: string | null,"original_invoice_id"?: string | null,"reason"?: string | null,"stamp_amount"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"total_ht"?: number,"total_tax"?: number,"total_ttc"?: number,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"departure_id"?: string | null,"document_id"?: string | null,"dossier_id"?: string | null,"due_date"?: string | null,"id"?: string,"issue_date"?: string | null,"kind"?: Database["public"]['Enums']["invoice_kind"],"notes"?: string | null,"number"?: string | null,"original_invoice_id"?: string | null,"reason"?: string | null,"stamp_amount"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"total_ht"?: number,"total_tax"?: number,"total_ttc"?: number,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "invoices_original_invoice_id_fkey"
      columns: ["original_invoice_id"]
isOneToOne: false
      referencedRelation: "invoice_balances"
      referencedColumns: ["invoice_id"]
    },{
      foreignKeyName: "invoices_original_invoice_id_fkey"
      columns: ["original_invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"entry_date": string,"id": string,"journal_code": string,"label": string,"number": string | null,"piece_ref": string | null,"posted_at": string | null,"posted_by": string | null,"reversal_of_id": string | null,"source_id": string | null,"source_type": string | null,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"entry_date": string,"id"?: string,"journal_code": string,"label": string,"number"?: string | null,"piece_ref"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"reversal_of_id"?: string | null,"source_id"?: string | null,"source_type"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"entry_date"?: string,"id"?: string,"journal_code"?: string,"label"?: string,"number"?: string | null,"piece_ref"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"reversal_of_id"?: string | null,"source_id"?: string | null,"source_type"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_entries_journal_code_fkey"
      columns: ["journal_code"]
isOneToOne: false
      referencedRelation: "journals"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "journal_entries_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "general_ledger"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "journal_entries_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_lines": {
                  Row: {
                    "account_code": string,"client_id": string | null,"credit": number,"debit": number,"departure_id": string | null,"dossier_id": string | null,"entry_id": string,"id": string,"label": string | null,"supplier_id": string | null
                  }
                  Insert: {
                    "account_code": string,"client_id"?: string | null,"credit"?: number,"debit"?: number,"departure_id"?: string | null,"dossier_id"?: string | null,"entry_id": string,"id"?: string,"label"?: string | null,"supplier_id"?: string | null
                  }
                  Update: {
                    "account_code"?: string,"client_id"?: string | null,"credit"?: number,"debit"?: number,"departure_id"?: string | null,"dossier_id"?: string | null,"entry_id"?: string,"id"?: string,"label"?: string | null,"supplier_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_lines_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "journal_lines_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "journal_lines_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "general_ledger"
      referencedColumns: ["entry_id"]
    },{
      foreignKeyName: "journal_lines_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"journals": {
                  Row: {
                    "code": string,"kind": string,"label": string
                  }
                  Insert: {
                    "code": string,"kind": string,"label": string
                  }
                  Update: {
                    "code"?: string,"kind"?: string,"label"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lead_assignment_rules": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"owner_id": string | null
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"owner_id"?: string | null
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_assignment_rules_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"adults": number,"budget": number | null,"children": number,"children_ages": (number)[],"client_id": string | null,"contact_snapshot": NonNullable<Json>,"created_at": string,"currency": string,"date_from": string | null,"date_to": string | null,"departure_id": string | null,"destination": string | null,"details": NonNullable<Json>,"flexible_dates": boolean,"id": string,"lost_reason": string | null,"marketing_consent": boolean,"message": string | null,"next_action": string | null,"next_action_at": string | null,"offer_id": string | null,"owner_id": string | null,"possible_duplicate_client_ids": (string)[],"processing_consent": boolean,"reference": string,"source": Database["public"]['Enums']["lead_source"],"stage": Database["public"]['Enums']["lead_stage"],"submission_token": string | null,"updated_at": string
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"adults"?: number,"budget"?: number | null,"children"?: number,"children_ages"?: (number)[],"client_id"?: string | null,"contact_snapshot"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"date_from"?: string | null,"date_to"?: string | null,"departure_id"?: string | null,"destination"?: string | null,"details"?: NonNullable<Json>,"flexible_dates"?: boolean,"id"?: string,"lost_reason"?: string | null,"marketing_consent"?: boolean,"message"?: string | null,"next_action"?: string | null,"next_action_at"?: string | null,"offer_id"?: string | null,"owner_id"?: string | null,"possible_duplicate_client_ids"?: (string)[],"processing_consent"?: boolean,"reference"?: string,"source"?: Database["public"]['Enums']["lead_source"],"stage"?: Database["public"]['Enums']["lead_stage"],"submission_token"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"adults"?: number,"budget"?: number | null,"children"?: number,"children_ages"?: (number)[],"client_id"?: string | null,"contact_snapshot"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"date_from"?: string | null,"date_to"?: string | null,"departure_id"?: string | null,"destination"?: string | null,"details"?: NonNullable<Json>,"flexible_dates"?: boolean,"id"?: string,"lost_reason"?: string | null,"marketing_consent"?: boolean,"message"?: string | null,"next_action"?: string | null,"next_action_at"?: string | null,"offer_id"?: string | null,"owner_id"?: string | null,"possible_duplicate_client_ids"?: (string)[],"processing_consent"?: boolean,"reference"?: string,"source"?: Database["public"]['Enums']["lead_source"],"stage"?: Database["public"]['Enums']["lead_stage"],"submission_token"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "leads_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_departure_fk"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_departure_fk"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_offer_fk"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_offer_fk"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "site_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"number_counters": {
                  Row: {
                    "code": string,"value": number,"year": number
                  }
                  Insert: {
                    "code": string,"value"?: number,"year": number
                  }
                  Update: {
                    "code"?: string,"value"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "number_counters_code_fkey"
      columns: ["code"]
isOneToOne: false
      referencedRelation: "number_series"
      referencedColumns: ["code"]
    }
                  ]
                },"number_series": {
                  Row: {
                    "code": string,"label": string,"padding": number,"per_year": boolean,"prefix": string
                  }
                  Insert: {
                    "code": string,"label": string,"padding"?: number,"per_year"?: boolean,"prefix": string
                  }
                  Update: {
                    "code"?: string,"label"?: string,"padding"?: number,"per_year"?: boolean,"prefix"?: string
                  }
                  Relationships: [
                    
                  ]
                },"offer_costings": {
                  Row: {
                    "estimated_cost": number | null,"notes": string | null,"offer_id": string,"target_margin_pct": number | null,"updated_at": string
                  }
                  Insert: {
                    "estimated_cost"?: number | null,"notes"?: string | null,"offer_id": string,"target_margin_pct"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "estimated_cost"?: number | null,"notes"?: string | null,"offer_id"?: string,"target_margin_pct"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_costings_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: true
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offer_costings_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: true
      referencedRelation: "site_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"board": string | null,"conditions": string | null,"country": string | null,"created_at": string,"cta_label": string,"currency": string,"deposit_amount": number | null,"destination": string,"duration_days": number | null,"exclusions": (string)[],"featured": boolean,"hotels": NonNullable<Json>,"id": string,"inclusions": (string)[],"indicative_flights": string | null,"internal_notes": string | null,"is_omra": boolean,"nights": number | null,"occupancy_basis": string | null,"owner_id": string | null,"photos": NonNullable<Json>,"price_amount": number | null,"price_basis": Database["public"]['Enums']["price_basis"],"program": NonNullable<Json>,"publish_at": string | null,"published_by": string | null,"seo_description": string | null,"seo_title": string | null,"slug": string,"sort_order": number,"status": Database["public"]['Enums']["publication_status"],"summary": string | null,"title": string,"unpublish_at": string | null,"updated_at": string,"offer_is_public": boolean | null
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"board"?: string | null,"conditions"?: string | null,"country"?: string | null,"created_at"?: string,"cta_label"?: string,"currency"?: string,"deposit_amount"?: number | null,"destination": string,"duration_days"?: number | null,"exclusions"?: (string)[],"featured"?: boolean,"hotels"?: NonNullable<Json>,"id"?: string,"inclusions"?: (string)[],"indicative_flights"?: string | null,"internal_notes"?: string | null,"is_omra"?: boolean,"nights"?: number | null,"occupancy_basis"?: string | null,"owner_id"?: string | null,"photos"?: NonNullable<Json>,"price_amount"?: number | null,"price_basis"?: Database["public"]['Enums']["price_basis"],"program"?: NonNullable<Json>,"publish_at"?: string | null,"published_by"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["publication_status"],"summary"?: string | null,"title": string,"unpublish_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"board"?: string | null,"conditions"?: string | null,"country"?: string | null,"created_at"?: string,"cta_label"?: string,"currency"?: string,"deposit_amount"?: number | null,"destination"?: string,"duration_days"?: number | null,"exclusions"?: (string)[],"featured"?: boolean,"hotels"?: NonNullable<Json>,"id"?: string,"inclusions"?: (string)[],"indicative_flights"?: string | null,"internal_notes"?: string | null,"is_omra"?: boolean,"nights"?: number | null,"occupancy_basis"?: string | null,"owner_id"?: string | null,"photos"?: NonNullable<Json>,"price_amount"?: number | null,"price_basis"?: Database["public"]['Enums']["price_basis"],"program"?: NonNullable<Json>,"publish_at"?: string | null,"published_by"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["publication_status"],"summary"?: string | null,"title"?: string,"unpublish_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_published_by_fkey"
      columns: ["published_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"outbox_messages": {
                  Row: {
                    "body": string,"channel": string,"created_at": string,"created_by": string | null,"dedupe_key": string | null,"dossier_id": string | null,"id": string,"lead_id": string | null,"provider_ref": string | null,"recipient": string,"sent_at": string | null,"status": string,"subject": string | null
                  }
                  Insert: {
                    "body": string,"channel": string,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"dossier_id"?: string | null,"id"?: string,"lead_id"?: string | null,"provider_ref"?: string | null,"recipient": string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"dossier_id"?: string | null,"id"?: string,"lead_id"?: string | null,"provider_ref"?: string | null,"recipient"?: string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbox_messages_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "outbox_messages_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbox_messages_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "outbox_messages_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"dossier_id": string | null,"id": string,"invoice_id": string | null,"note": string | null,"payment_id": string,"supplier_invoice_id": string | null
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"dossier_id"?: string | null,"id"?: string,"invoice_id"?: string | null,"note"?: string | null,"payment_id": string,"supplier_invoice_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"dossier_id"?: string | null,"id"?: string,"invoice_id"?: string | null,"note"?: string | null,"payment_id"?: string,"supplier_invoice_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "payment_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "payment_allocations_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoice_balances"
      referencedColumns: ["invoice_id"]
    },{
      foreignKeyName: "payment_allocations_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payment_unallocated"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_supplier_invoice_fk"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoice_balances"
      referencedColumns: ["supplier_invoice_id"]
    },{
      foreignKeyName: "payment_allocations_supplier_invoice_fk"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_intents": {
                  Row: {
                    "amount": number,"client_id": string,"created_at": string,"created_by": string | null,"currency": string,"dossier_id": string,"id": string,"payment_id": string | null,"provider": string,"provider_session_id": string | null,"schedule_item_id": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "amount": number,"client_id": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"dossier_id": string,"id"?: string,"payment_id"?: string | null,"provider": string,"provider_session_id"?: string | null,"schedule_item_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"dossier_id"?: string,"id"?: string,"payment_id"?: string | null,"provider"?: string,"provider_session_id"?: string | null,"schedule_item_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_intents_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "payment_intents_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_intents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "payment_intents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_intents_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "payment_intents_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payment_unallocated"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "payment_intents_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_intents_schedule_item_id_fkey"
      columns: ["schedule_item_id"]
isOneToOne: false
      referencedRelation: "payment_schedule_items"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_schedule_items": {
                  Row: {
                    "amount": number,"created_at": string,"dossier_id": string,"due_date": string | null,"id": string,"kind": string,"label": string,"seq": number
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"dossier_id": string,"due_date"?: string | null,"id"?: string,"kind"?: string,"label": string,"seq": number
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"dossier_id"?: string,"due_date"?: string | null,"id"?: string,"kind"?: string,"label"?: string,"seq"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_schedule_items_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "payment_schedule_items_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedule_items_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    }
                  ]
                },"payment_webhook_events": {
                  Row: {
                    "event_id": string,"event_type": string,"id": string,"intent_id": string | null,"payload": NonNullable<Json>,"provider": string,"received_at": string,"result": string | null,"signature_valid": boolean
                  }
                  Insert: {
                    "event_id": string,"event_type": string,"id"?: string,"intent_id"?: string | null,"payload": NonNullable<Json>,"provider": string,"received_at"?: string,"result"?: string | null,"signature_valid": boolean
                  }
                  Update: {
                    "event_id"?: string,"event_type"?: string,"id"?: string,"intent_id"?: string | null,"payload"?: NonNullable<Json>,"provider"?: string,"received_at"?: string,"result"?: string | null,"signature_valid"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_webhook_events_intent_id_fkey"
      columns: ["intent_id"]
isOneToOne: false
      referencedRelation: "payment_intents"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"amount_tnd": number | null,"client_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deposit_slip_id": string | null,"direction": string,"drawer_bank": string | null,"due_date": string | null,"external_ref": string | null,"fees": number,"fx_rate": number,"fx_rate_date": string | null,"fx_rate_source": string | null,"id": string,"idempotency_key": string | null,"instrument_number": string | null,"kind": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"online_intent_id": string | null,"proof_document_id": string | null,"received_at": string,"reference": string,"rejection_reason": string | null,"reversal_of_id": string | null,"status": Database["public"]['Enums']["payment_status"],"supplier_id": string | null,"treasury_account_id": string | null,"validated_at": string | null,"validated_by": string | null,"value_date": string | null,"withholding_amount": number
                  }
                  Insert: {
                    "amount": number,"amount_tnd"?: never,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deposit_slip_id"?: string | null,"direction": string,"drawer_bank"?: string | null,"due_date"?: string | null,"external_ref"?: string | null,"fees"?: number,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"id"?: string,"idempotency_key"?: string | null,"instrument_number"?: string | null,"kind"?: string,"method": Database["public"]['Enums']["payment_method"],"notes"?: string | null,"online_intent_id"?: string | null,"proof_document_id"?: string | null,"received_at"?: string,"reference"?: string,"rejection_reason"?: string | null,"reversal_of_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"supplier_id"?: string | null,"treasury_account_id"?: string | null,"validated_at"?: string | null,"validated_by"?: string | null,"value_date"?: string | null,"withholding_amount"?: number
                  }
                  Update: {
                    "amount"?: number,"amount_tnd"?: never,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deposit_slip_id"?: string | null,"direction"?: string,"drawer_bank"?: string | null,"due_date"?: string | null,"external_ref"?: string | null,"fees"?: number,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"id"?: string,"idempotency_key"?: string | null,"instrument_number"?: string | null,"kind"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"online_intent_id"?: string | null,"proof_document_id"?: string | null,"received_at"?: string,"reference"?: string,"rejection_reason"?: string | null,"reversal_of_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"supplier_id"?: string | null,"treasury_account_id"?: string | null,"validated_at"?: string | null,"validated_by"?: string | null,"value_date"?: string | null,"withholding_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_deposit_slip_id_fkey"
      columns: ["deposit_slip_id"]
isOneToOne: false
      referencedRelation: "deposit_slips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_online_intent_fk"
      columns: ["online_intent_id"]
isOneToOne: false
      referencedRelation: "payment_intents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_proof_document_id_fkey"
      columns: ["proof_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "payment_unallocated"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "payments_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_balances"
      referencedColumns: ["id"]
    }
                  ]
                },"posting_rules": {
                  Row: {
                    "credit_account": string,"debit_account": string,"event": string,"journal_code": string,"label": string,"validated_by_accountant": boolean
                  }
                  Insert: {
                    "credit_account": string,"debit_account": string,"event": string,"journal_code": string,"label": string,"validated_by_accountant"?: boolean
                  }
                  Update: {
                    "credit_account"?: string,"debit_account"?: string,"event"?: string,"journal_code"?: string,"label"?: string,"validated_by_accountant"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "posting_rules_credit_account_fkey"
      columns: ["credit_account"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "posting_rules_debit_account_fkey"
      columns: ["debit_account"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "posting_rules_journal_code_fkey"
      columns: ["journal_code"]
isOneToOne: false
      referencedRelation: "journals"
      referencedColumns: ["code"]
    }
                  ]
                },"quote_lines": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"cost_currency": string,"description": string,"details": NonNullable<Json>,"end_date": string | null,"fx_rate": number,"hotel_id": string | null,"id": string,"is_mandatory": boolean,"is_optional": boolean,"option_selected": boolean,"pax_type": Database["public"]['Enums']["pax_type"],"position": number,"quantity": number,"service_type": Database["public"]['Enums']["service_type"],"start_date": string | null,"supplier_id": string | null,"unit_cost": number,"unit_price": number,"version_id": string
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"cost_currency"?: string,"description": string,"details"?: NonNullable<Json>,"end_date"?: string | null,"fx_rate"?: number,"hotel_id"?: string | null,"id"?: string,"is_mandatory"?: boolean,"is_optional"?: boolean,"option_selected"?: boolean,"pax_type"?: Database["public"]['Enums']["pax_type"],"position"?: number,"quantity"?: number,"service_type": Database["public"]['Enums']["service_type"],"start_date"?: string | null,"supplier_id"?: string | null,"unit_cost"?: number,"unit_price"?: number,"version_id": string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"cost_currency"?: string,"description"?: string,"details"?: NonNullable<Json>,"end_date"?: string | null,"fx_rate"?: number,"hotel_id"?: string | null,"id"?: string,"is_mandatory"?: boolean,"is_optional"?: boolean,"option_selected"?: boolean,"pax_type"?: Database["public"]['Enums']["pax_type"],"position"?: number,"quantity"?: number,"service_type"?: Database["public"]['Enums']["service_type"],"start_date"?: string | null,"supplier_id"?: string | null,"unit_cost"?: number,"unit_price"?: number,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_lines_hotel_id_fkey"
      columns: ["hotel_id"]
isOneToOne: false
      referencedRelation: "hotels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "quote_version_totals"
      referencedColumns: ["version_id"]
    },{
      foreignKeyName: "quote_lines_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "quote_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_versions": {
                  Row: {
                    "adults": number,"children": number,"client_notes": string | null,"created_at": string,"created_by": string | null,"currency": string,"end_date": string | null,"exclusions": (string)[],"id": string,"inclusions": (string)[],"infants": number,"internal_notes": string | null,"label": string | null,"language": string,"payment_terms": NonNullable<Json>,"program": NonNullable<Json>,"quote_id": string,"responded_at": string | null,"response_note": string | null,"sent_at": string | null,"sent_via": string | null,"start_date": string | null,"status": Database["public"]['Enums']["quote_status"],"valid_until": string | null,"version_no": number
                  }
                  Insert: {
                    "adults"?: number,"children"?: number,"client_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"end_date"?: string | null,"exclusions"?: (string)[],"id"?: string,"inclusions"?: (string)[],"infants"?: number,"internal_notes"?: string | null,"label"?: string | null,"language"?: string,"payment_terms"?: NonNullable<Json>,"program"?: NonNullable<Json>,"quote_id": string,"responded_at"?: string | null,"response_note"?: string | null,"sent_at"?: string | null,"sent_via"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"valid_until"?: string | null,"version_no": number
                  }
                  Update: {
                    "adults"?: number,"children"?: number,"client_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"end_date"?: string | null,"exclusions"?: (string)[],"id"?: string,"inclusions"?: (string)[],"infants"?: number,"internal_notes"?: string | null,"label"?: string | null,"language"?: string,"payment_terms"?: NonNullable<Json>,"program"?: NonNullable<Json>,"quote_id"?: string,"responded_at"?: string | null,"response_note"?: string | null,"sent_at"?: string | null,"sent_via"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"valid_until"?: string | null,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"client_id": string,"created_at": string,"departure_id": string | null,"id": string,"lead_id": string | null,"lost_reason": string | null,"offer_id": string | null,"owner_id": string | null,"reference": string,"status": Database["public"]['Enums']["quote_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"client_id": string,"created_at"?: string,"departure_id"?: string | null,"id"?: string,"lead_id"?: string | null,"lost_reason"?: string | null,"offer_id"?: string | null,"owner_id"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"client_id"?: string,"created_at"?: string,"departure_id"?: string | null,"id"?: string,"lead_id"?: string | null,"lost_reason"?: string | null,"offer_id"?: string | null,"owner_id"?: string | null,"reference"?: string,"status"?: Database["public"]['Enums']["quote_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "quotes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_departure_id_fkey"
      columns: ["departure_id"]
isOneToOne: false
      referencedRelation: "site_departures"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "site_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "action": Database["public"]['Enums']["perm_action"],"module": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Insert: {
                    "action": Database["public"]['Enums']["perm_action"],"module": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["perm_action"],"module"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"],"board": string | null,"cancellation_terms": string | null,"confirmation_document_id": string | null,"confirmation_ref": string | null,"confirmed_at": string | null,"cost_confirmed": number | null,"cost_currency": string,"cost_planned": number,"created_at": string,"description": string,"details": NonNullable<Json>,"dossier_id": string,"end_at": string | null,"end_date": string | null,"external_provider": string | null,"external_ref": string | null,"fx_rate": number,"fx_rate_date": string | null,"fx_rate_source": string | null,"hotel_id": string | null,"id": string,"is_mandatory": boolean,"linked_service_id": string | null,"local_timezone": string,"needs_review": boolean,"nights": number | null,"occupancy": string | null,"option_deadline": string | null,"pax_type": Database["public"]['Enums']["pax_type"],"quantity": number,"quote_line_id": string | null,"review_reason": string | null,"room_type": string | null,"sale_price": number,"service_type": Database["public"]['Enums']["service_type"],"start_at": string | null,"start_date": string | null,"status": Database["public"]['Enums']["service_status"],"supplier_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "activity": Database["public"]['Enums']["activity"],"board"?: string | null,"cancellation_terms"?: string | null,"confirmation_document_id"?: string | null,"confirmation_ref"?: string | null,"confirmed_at"?: string | null,"cost_confirmed"?: number | null,"cost_currency"?: string,"cost_planned"?: number,"created_at"?: string,"description": string,"details"?: NonNullable<Json>,"dossier_id": string,"end_at"?: string | null,"end_date"?: string | null,"external_provider"?: string | null,"external_ref"?: string | null,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"hotel_id"?: string | null,"id"?: string,"is_mandatory"?: boolean,"linked_service_id"?: string | null,"local_timezone"?: string,"needs_review"?: boolean,"nights"?: never,"occupancy"?: string | null,"option_deadline"?: string | null,"pax_type"?: Database["public"]['Enums']["pax_type"],"quantity"?: number,"quote_line_id"?: string | null,"review_reason"?: string | null,"room_type"?: string | null,"sale_price"?: number,"service_type": Database["public"]['Enums']["service_type"],"start_at"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["service_status"],"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"],"board"?: string | null,"cancellation_terms"?: string | null,"confirmation_document_id"?: string | null,"confirmation_ref"?: string | null,"confirmed_at"?: string | null,"cost_confirmed"?: number | null,"cost_currency"?: string,"cost_planned"?: number,"created_at"?: string,"description"?: string,"details"?: NonNullable<Json>,"dossier_id"?: string,"end_at"?: string | null,"end_date"?: string | null,"external_provider"?: string | null,"external_ref"?: string | null,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"hotel_id"?: string | null,"id"?: string,"is_mandatory"?: boolean,"linked_service_id"?: string | null,"local_timezone"?: string,"needs_review"?: boolean,"nights"?: never,"occupancy"?: string | null,"option_deadline"?: string | null,"pax_type"?: Database["public"]['Enums']["pax_type"],"quantity"?: number,"quote_line_id"?: string | null,"review_reason"?: string | null,"room_type"?: string | null,"sale_price"?: number,"service_type"?: Database["public"]['Enums']["service_type"],"start_at"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["service_status"],"supplier_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_confirmation_doc_fk"
      columns: ["confirmation_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "services_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "services_hotel_id_fkey"
      columns: ["hotel_id"]
isOneToOne: false
      referencedRelation: "hotels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_linked_service_id_fkey"
      columns: ["linked_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_quote_line_id_fkey"
      columns: ["quote_line_id"]
isOneToOne: false
      referencedRelation: "quote_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"site_pages": {
                  Row: {
                    "body": string,"id": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"status": Database["public"]['Enums']["publication_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "body"?: string,"id"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["publication_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["publication_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site_redirects": {
                  Row: {
                    "created_at": string,"from_path": string,"permanent": boolean,"to_path": string
                  }
                  Insert: {
                    "created_at"?: string,"from_path": string,"permanent"?: boolean,"to_path": string
                  }
                  Update: {
                    "created_at"?: string,"from_path"?: string,"permanent"?: boolean,"to_path"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_profiles": {
                  Row: {
                    "active": boolean,"backup_id": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Insert: {
                    "active"?: boolean,"backup_id"?: string | null,"created_at"?: string,"email": string,"full_name": string,"id": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "active"?: boolean,"backup_id"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_profiles_backup_id_fkey"
      columns: ["backup_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_contracts": {
                  Row: {
                    "child_rules": string | null,"created_at": string,"currency": string,"document_id": string | null,"free_places": string | null,"id": string,"penalties": string | null,"supplier_id": string,"terms": NonNullable<Json>,"title": string,"valid_from": string | null,"valid_to": string | null
                  }
                  Insert: {
                    "child_rules"?: string | null,"created_at"?: string,"currency"?: string,"document_id"?: string | null,"free_places"?: string | null,"id"?: string,"penalties"?: string | null,"supplier_id": string,"terms"?: NonNullable<Json>,"title": string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "child_rules"?: string | null,"created_at"?: string,"currency"?: string,"document_id"?: string | null,"free_places"?: string | null,"id"?: string,"penalties"?: string | null,"supplier_id"?: string,"terms"?: NonNullable<Json>,"title"?: string,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_contracts_doc_fk"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_contracts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_invoice_lines": {
                  Row: {
                    "amount": number,"description": string,"id": string,"quantity": number,"service_id": string | null,"supplier_invoice_id": string
                  }
                  Insert: {
                    "amount": number,"description": string,"id"?: string,"quantity"?: number,"service_id"?: string | null,"supplier_invoice_id": string
                  }
                  Update: {
                    "amount"?: number,"description"?: string,"id"?: string,"quantity"?: number,"service_id"?: string | null,"supplier_invoice_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_invoice_lines_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_invoice_lines_supplier_invoice_id_fkey"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoice_balances"
      referencedColumns: ["supplier_invoice_id"]
    },{
      foreignKeyName: "supplier_invoice_lines_supplier_invoice_id_fkey"
      columns: ["supplier_invoice_id"]
isOneToOne: false
      referencedRelation: "supplier_invoices"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_invoices": {
                  Row: {
                    "created_at": string,"created_by": string | null,"currency": string,"document_id": string | null,"due_date": string | null,"duplicate_justification": string | null,"fx_rate": number,"fx_rate_date": string | null,"fx_rate_source": string | null,"id": string,"issue_date": string,"notes": string | null,"service_period_end": string | null,"service_period_start": string | null,"status": string,"supplier_id": string,"supplier_ref": string,"tax_amount": number,"total_amount": number,"total_tnd": number | null,"withholding_amount": number,"withholding_base": number | null,"withholding_certificate_document_id": string | null,"withholding_rule": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"document_id"?: string | null,"due_date"?: string | null,"duplicate_justification"?: string | null,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"id"?: string,"issue_date": string,"notes"?: string | null,"service_period_end"?: string | null,"service_period_start"?: string | null,"status"?: string,"supplier_id": string,"supplier_ref": string,"tax_amount"?: number,"total_amount": number,"total_tnd"?: never,"withholding_amount"?: number,"withholding_base"?: number | null,"withholding_certificate_document_id"?: string | null,"withholding_rule"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"currency"?: string,"document_id"?: string | null,"due_date"?: string | null,"duplicate_justification"?: string | null,"fx_rate"?: number,"fx_rate_date"?: string | null,"fx_rate_source"?: string | null,"id"?: string,"issue_date"?: string,"notes"?: string | null,"service_period_end"?: string | null,"service_period_start"?: string | null,"status"?: string,"supplier_id"?: string,"supplier_ref"?: string,"tax_amount"?: number,"total_amount"?: number,"total_tnd"?: never,"withholding_amount"?: number,"withholding_base"?: number | null,"withholding_certificate_document_id"?: string | null,"withholding_rule"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_invoices_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_invoices_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_invoices_withholding_certificate_document_id_fkey"
      columns: ["withholding_certificate_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "account_code": string | null,"active": boolean,"city": string | null,"conditions": string | null,"contacts": NonNullable<Json>,"country": string | null,"created_at": string,"currency": string,"destinations": (string)[],"email": string | null,"id": string,"kind": Database["public"]['Enums']["supplier_kind"],"name": string,"payment_terms": string | null,"phone": string | null,"tax_id": string | null,"updated_at": string,"withholding_applicable": boolean
                  }
                  Insert: {
                    "account_code"?: string | null,"active"?: boolean,"city"?: string | null,"conditions"?: string | null,"contacts"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"currency"?: string,"destinations"?: (string)[],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["supplier_kind"],"name": string,"payment_terms"?: string | null,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string,"withholding_applicable"?: boolean
                  }
                  Update: {
                    "account_code"?: string | null,"active"?: boolean,"city"?: string | null,"conditions"?: string | null,"contacts"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"currency"?: string,"destinations"?: (string)[],"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["supplier_kind"],"name"?: string,"payment_terms"?: string | null,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string,"withholding_applicable"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"] | null,"assignee_id": string | null,"completed_at": string | null,"completion_note": string | null,"created_at": string,"created_by": string | null,"deadline_id": string | null,"dedupe_key": string | null,"description": string | null,"dossier_id": string | null,"due_at": string | null,"financial_risk": boolean,"id": string,"last_action_at": string | null,"manual_priority": string | null,"manual_priority_reason": string | null,"next_follow_up_at": string | null,"proof_document_id": string | null,"service_id": string | null,"source": string,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"waiting_reason": string | null
                  }
                  Insert: {
                    "activity"?: Database["public"]['Enums']["activity"] | null,"assignee_id"?: string | null,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline_id"?: string | null,"dedupe_key"?: string | null,"description"?: string | null,"dossier_id"?: string | null,"due_at"?: string | null,"financial_risk"?: boolean,"id"?: string,"last_action_at"?: string | null,"manual_priority"?: string | null,"manual_priority_reason"?: string | null,"next_follow_up_at"?: string | null,"proof_document_id"?: string | null,"service_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"waiting_reason"?: string | null
                  }
                  Update: {
                    "activity"?: Database["public"]['Enums']["activity"] | null,"assignee_id"?: string | null,"completed_at"?: string | null,"completion_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"deadline_id"?: string | null,"dedupe_key"?: string | null,"description"?: string | null,"dossier_id"?: string | null,"due_at"?: string | null,"financial_risk"?: boolean,"id"?: string,"last_action_at"?: string | null,"manual_priority"?: string | null,"manual_priority_reason"?: string | null,"next_follow_up_at"?: string | null,"proof_document_id"?: string | null,"service_id"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"waiting_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_deadline_id_fkey"
      columns: ["deadline_id"]
isOneToOne: false
      referencedRelation: "external_deadlines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "tasks_proof_document_id_fkey"
      columns: ["proof_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_rules": {
                  Row: {
                    "code": string,"effective_from": string,"effective_to": string | null,"fixed_amount": number | null,"id": string,"kind": string,"label": string,"rate": number | null,"validated_by_accountant": boolean
                  }
                  Insert: {
                    "code": string,"effective_from": string,"effective_to"?: string | null,"fixed_amount"?: number | null,"id"?: string,"kind": string,"label": string,"rate"?: number | null,"validated_by_accountant"?: boolean
                  }
                  Update: {
                    "code"?: string,"effective_from"?: string,"effective_to"?: string | null,"fixed_amount"?: number | null,"id"?: string,"kind"?: string,"label"?: string,"rate"?: number | null,"validated_by_accountant"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"tickets": {
                  Row: {
                    "created_at": string,"currency": string,"fare": number,"id": string,"issue_deadline": string | null,"issued_at": string | null,"passenger_name": string | null,"penalty": number,"pnr": string | null,"refund_amount": number | null,"reissue_of_id": string | null,"sale_price": number,"service_fee": number,"service_id": string,"status": string,"taxes": number,"ticket_number": string | null,"traveller_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string,"fare"?: number,"id"?: string,"issue_deadline"?: string | null,"issued_at"?: string | null,"passenger_name"?: string | null,"penalty"?: number,"pnr"?: string | null,"refund_amount"?: number | null,"reissue_of_id"?: string | null,"sale_price"?: number,"service_fee"?: number,"service_id": string,"status"?: string,"taxes"?: number,"ticket_number"?: string | null,"traveller_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"fare"?: number,"id"?: string,"issue_deadline"?: string | null,"issued_at"?: string | null,"passenger_name"?: string | null,"penalty"?: number,"pnr"?: string | null,"refund_amount"?: number | null,"reissue_of_id"?: string | null,"sale_price"?: number,"service_fee"?: number,"service_id"?: string,"status"?: string,"taxes"?: number,"ticket_number"?: string | null,"traveller_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_reissue_of_id_fkey"
      columns: ["reissue_of_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_traveller_id_fkey"
      columns: ["traveller_id"]
isOneToOne: false
      referencedRelation: "travellers"
      referencedColumns: ["id"]
    }
                  ]
                },"traveller_identity_documents": {
                  Row: {
                    "created_at": string,"doc_type": string,"expiry_date": string | null,"id": string,"issue_date": string | null,"issuing_country": string | null,"passport_number": string,"traveller_id": string
                  }
                  Insert: {
                    "created_at"?: string,"doc_type"?: string,"expiry_date"?: string | null,"id"?: string,"issue_date"?: string | null,"issuing_country"?: string | null,"passport_number": string,"traveller_id": string
                  }
                  Update: {
                    "created_at"?: string,"doc_type"?: string,"expiry_date"?: string | null,"id"?: string,"issue_date"?: string | null,"issuing_country"?: string | null,"passport_number"?: string,"traveller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "traveller_identity_documents_traveller_id_fkey"
      columns: ["traveller_id"]
isOneToOne: false
      referencedRelation: "travellers"
      referencedColumns: ["id"]
    }
                  ]
                },"travellers": {
                  Row: {
                    "birth_date": string | null,"client_id": string | null,"created_at": string,"email": string | null,"first_name": string,"gender": string | null,"id": string,"last_name": string,"nationality": string | null,"notes": string | null,"pax_type": string,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "birth_date"?: string | null,"client_id"?: string | null,"created_at"?: string,"email"?: string | null,"first_name": string,"gender"?: string | null,"id"?: string,"last_name": string,"nationality"?: string | null,"notes"?: string | null,"pax_type"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "birth_date"?: string | null,"client_id"?: string | null,"created_at"?: string,"email"?: string | null,"first_name"?: string,"gender"?: string | null,"id"?: string,"last_name"?: string,"nationality"?: string | null,"notes"?: string | null,"pax_type"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "travellers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "travellers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"treasury_accounts": {
                  Row: {
                    "account_code": string,"active": boolean,"bank_name": string | null,"currency": string,"iban": string | null,"id": string,"kind": string,"name": string,"opening_balance": number,"opening_date": string
                  }
                  Insert: {
                    "account_code": string,"active"?: boolean,"bank_name"?: string | null,"currency"?: string,"iban"?: string | null,"id"?: string,"kind": string,"name": string,"opening_balance"?: number,"opening_date": string
                  }
                  Update: {
                    "account_code"?: string,"active"?: boolean,"bank_name"?: string | null,"currency"?: string,"iban"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"opening_balance"?: number,"opening_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "treasury_accounts_account_code_fkey"
      columns: ["account_code"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["code"]
    }
                  ]
                },"treasury_movements": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"kind": string,"label": string,"movement_date": string,"payment_id": string | null,"proof_document_id": string | null,"reconciled": boolean,"transfer_group_id": string | null,"treasury_account_id": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"label": string,"movement_date": string,"payment_id"?: string | null,"proof_document_id"?: string | null,"reconciled"?: boolean,"transfer_group_id"?: string | null,"treasury_account_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"label"?: string,"movement_date"?: string,"payment_id"?: string | null,"proof_document_id"?: string | null,"reconciled"?: boolean,"transfer_group_id"?: string | null,"treasury_account_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "treasury_movements_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payment_unallocated"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "treasury_movements_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treasury_movements_proof_document_id_fkey"
      columns: ["proof_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treasury_movements_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "treasury_movements_treasury_account_id_fkey"
      columns: ["treasury_account_id"]
isOneToOne: false
      referencedRelation: "treasury_balances"
      referencedColumns: ["id"]
    }
                  ]
                },"visa_applications": {
                  Row: {
                    "agency_fee": number,"appointment_at": string | null,"center_fee": number,"checklist": NonNullable<Json>,"checklist_version": string | null,"consular_fee": number,"created_at": string,"decision": string | null,"destination": string,"expiry_date": string | null,"id": string,"notes": string | null,"passport_returned_at": string | null,"service_id": string,"status": string,"submitted_at": string | null,"traveller_id": string | null,"visa_type": string
                  }
                  Insert: {
                    "agency_fee"?: number,"appointment_at"?: string | null,"center_fee"?: number,"checklist"?: NonNullable<Json>,"checklist_version"?: string | null,"consular_fee"?: number,"created_at"?: string,"decision"?: string | null,"destination": string,"expiry_date"?: string | null,"id"?: string,"notes"?: string | null,"passport_returned_at"?: string | null,"service_id": string,"status"?: string,"submitted_at"?: string | null,"traveller_id"?: string | null,"visa_type"?: string
                  }
                  Update: {
                    "agency_fee"?: number,"appointment_at"?: string | null,"center_fee"?: number,"checklist"?: NonNullable<Json>,"checklist_version"?: string | null,"consular_fee"?: number,"created_at"?: string,"decision"?: string | null,"destination"?: string,"expiry_date"?: string | null,"id"?: string,"notes"?: string | null,"passport_returned_at"?: string | null,"service_id"?: string,"status"?: string,"submitted_at"?: string | null,"traveller_id"?: string | null,"visa_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "visa_applications_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visa_applications_traveller_id_fkey"
      columns: ["traveller_id"]
isOneToOne: false
      referencedRelation: "travellers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "aged_receivables": {
                  Row: {
                    "client_id": string | null,"d0_30": number | null,"d31_60": number | null,"d60_plus": number | null,"display_name": string | null,"not_due": number | null,"total": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"client_balances": {
                  Row: {
                    "balance": number | null,"client_id": string | null,"credited": number | null,"display_name": string | null,"invoiced": number | null,"paid": number | null
                  }
                  Insert: {
                           "balance"?: never,"client_id"?: string | null,"credited"?: never,"display_name"?: string | null,"invoiced"?: never,"paid"?: never
                         }
                        Update: {
                           "balance"?: never,"client_id"?: string | null,"credited"?: never,"display_name"?: string | null,"invoiced"?: never,"paid"?: never
                         }
                        Relationships: [
                    
                  ]
                },"dossier_financials": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"] | null,"balance": number | null,"client_id": string | null,"cost_actual": number | null,"cost_confirmed": number | null,"cost_planned": number | null,"costs_incomplete": boolean | null,"credit_notes": number | null,"dossier_id": string | null,"invoiced": number | null,"invoiced_net": number | null,"margin_actual": number | null,"margin_confirmed": number | null,"margin_forecast": number | null,"margin_state": string | null,"overdue": number | null,"owner_id": string | null,"paid": number | null,"reference": string | null,"sale_net": number | null,"sale_planned": number | null,"scheduled": number | null,"start_date": string | null,"status": Database["public"]['Enums']["dossier_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dossiers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "dossiers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dossiers_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"general_ledger": {
                  Row: {
                    "account_code": string | null,"account_label": string | null,"client_id": string | null,"credit": number | null,"debit": number | null,"dossier_id": string | null,"entry_date": string | null,"entry_id": string | null,"entry_label": string | null,"journal_code": string | null,"label": string | null,"line_id": string | null,"number": string | null,"piece_ref": string | null,"running_balance": number | null,"source_id": string | null,"source_type": string | null,"supplier_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_entries_journal_code_fkey"
      columns: ["journal_code"]
isOneToOne: false
      referencedRelation: "journals"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "journal_lines_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "journal_lines_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "journal_lines_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_balances": {
                  Row: {
                    "client_id": string | null,"credited": number | null,"dossier_id": string | null,"due_date": string | null,"invoice_id": string | null,"issue_date": string | null,"kind": Database["public"]['Enums']["invoice_kind"] | null,"number": string | null,"open_amount": number | null,"paid": number | null,"status": Database["public"]['Enums']["invoice_status"] | null,"total_ttc": number | null
                  }
                  Insert: {
                           "client_id"?: string | null,"credited"?: never,"dossier_id"?: string | null,"due_date"?: string | null,"invoice_id"?: string | null,"issue_date"?: string | null,"kind"?: Database["public"]['Enums']["invoice_kind"] | null,"number"?: string | null,"open_amount"?: never,"paid"?: never,"status"?: Database["public"]['Enums']["invoice_status"] | null,"total_ttc"?: number | null
                         }
                        Update: {
                           "client_id"?: string | null,"credited"?: never,"dossier_id"?: string | null,"due_date"?: string | null,"invoice_id"?: string | null,"issue_date"?: string | null,"kind"?: Database["public"]['Enums']["invoice_kind"] | null,"number"?: string | null,"open_amount"?: never,"paid"?: never,"status"?: Database["public"]['Enums']["invoice_status"] | null,"total_ttc"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    }
                  ]
                },"payment_unallocated": {
                  Row: {
                    "allocated": number | null,"amount": number | null,"client_id": string | null,"direction": string | null,"payment_id": string | null,"reference": string | null,"status": Database["public"]['Enums']["payment_status"] | null,"supplier_id": string | null,"unallocated": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "client_balances"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "payments_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_dossier_balances": {
                  Row: {
                    "balance": number | null,"credit_notes": number | null,"dossier_id": string | null,"paid": number | null,"reference": string | null,"total_price": number | null
                  }
                  Insert: {
                           "balance"?: never,"credit_notes"?: never,"dossier_id"?: string | null,"paid"?: never,"reference"?: string | null,"total_price"?: number | null
                         }
                        Update: {
                           "balance"?: never,"credit_notes"?: never,"dossier_id"?: string | null,"paid"?: never,"reference"?: string | null,"total_price"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"quote_version_totals": {
                  Row: {
                    "optional_total": number | null,"quote_id": string | null,"total_cost_tnd": number | null,"total_price": number | null,"version_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_versions_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    }
                  ]
                },"site_departures": {
                  Row: {
                    "availability": string | null,"booking_deadline": string | null,"code": string | null,"currency": string | null,"deposit_amount": number | null,"end_date": string | null,"id": string | null,"offer_id": string | null,"price_adult": number | null,"price_child": number | null,"price_infant": number | null,"seats_available": number | null,"single_supplement": number | null,"start_date": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "departures_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "departures_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "site_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"site_offers": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"] | null,"board": string | null,"conditions": string | null,"country": string | null,"cta_label": string | null,"currency": string | null,"deposit_amount": number | null,"destination": string | null,"duration_days": number | null,"exclusions": (string)[] | null,"featured": boolean | null,"hotels": Json | null,"id": string | null,"inclusions": (string)[] | null,"indicative_flights": string | null,"is_omra": boolean | null,"next_departure": string | null,"nights": number | null,"occupancy_basis": string | null,"photos": Json | null,"price_amount": number | null,"price_basis": Database["public"]['Enums']["price_basis"] | null,"program": Json | null,"seo_description": string | null,"seo_title": string | null,"slug": string | null,"sort_order": number | null,"summary": string | null,"title": string | null,"updated_at": string | null
                  }
                  Insert: {
                           "activity"?: Database["public"]['Enums']["activity"] | null,"board"?: string | null,"conditions"?: string | null,"country"?: string | null,"cta_label"?: string | null,"currency"?: string | null,"deposit_amount"?: number | null,"destination"?: string | null,"duration_days"?: number | null,"exclusions"?: (string)[] | null,"featured"?: boolean | null,"hotels"?: Json | null,"id"?: string | null,"inclusions"?: (string)[] | null,"indicative_flights"?: string | null,"is_omra"?: boolean | null,"next_departure"?: never,"nights"?: number | null,"occupancy_basis"?: string | null,"photos"?: Json | null,"price_amount"?: number | null,"price_basis"?: Database["public"]['Enums']["price_basis"] | null,"program"?: Json | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string | null,"sort_order"?: number | null,"summary"?: string | null,"title"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "activity"?: Database["public"]['Enums']["activity"] | null,"board"?: string | null,"conditions"?: string | null,"country"?: string | null,"cta_label"?: string | null,"currency"?: string | null,"deposit_amount"?: number | null,"destination"?: string | null,"duration_days"?: number | null,"exclusions"?: (string)[] | null,"featured"?: boolean | null,"hotels"?: Json | null,"id"?: string | null,"inclusions"?: (string)[] | null,"indicative_flights"?: string | null,"is_omra"?: boolean | null,"next_departure"?: never,"nights"?: number | null,"occupancy_basis"?: string | null,"photos"?: Json | null,"price_amount"?: number | null,"price_basis"?: Database["public"]['Enums']["price_basis"] | null,"program"?: Json | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string | null,"sort_order"?: number | null,"summary"?: string | null,"title"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"site_public_pages": {
                  Row: {
                    "body": string | null,"seo_description": string | null,"seo_title": string | null,"slug": string | null,"title": string | null,"updated_at": string | null
                  }
                  Insert: {
                           "body"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string | null,"title"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "body"?: string | null,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string | null,"title"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"supplier_invoice_balances": {
                  Row: {
                    "allocated": number | null,"currency": string | null,"due_date": string | null,"issue_date": string | null,"paid": number | null,"remaining": number | null,"status": string | null,"supplier_id": string | null,"supplier_invoice_id": string | null,"supplier_ref": string | null,"total_amount": number | null,"unallocated": number | null,"withholding_amount": number | null
                  }
                  Insert: {
                           "allocated"?: never,"currency"?: string | null,"due_date"?: string | null,"issue_date"?: string | null,"paid"?: never,"remaining"?: never,"status"?: string | null,"supplier_id"?: string | null,"supplier_invoice_id"?: string | null,"supplier_ref"?: string | null,"total_amount"?: number | null,"unallocated"?: never,"withholding_amount"?: number | null
                         }
                        Update: {
                           "allocated"?: never,"currency"?: string | null,"due_date"?: string | null,"issue_date"?: string | null,"paid"?: never,"remaining"?: never,"status"?: string | null,"supplier_id"?: string | null,"supplier_invoice_id"?: string | null,"supplier_ref"?: string | null,"total_amount"?: number | null,"unallocated"?: never,"withholding_amount"?: number | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "supplier_invoices_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"task_board": {
                  Row: {
                    "activity": Database["public"]['Enums']["activity"] | null,"assignee_id": string | null,"assignee_name": string | null,"client_name": string | null,"completed_at": string | null,"completion_note": string | null,"created_at": string | null,"created_by": string | null,"deadline_id": string | null,"dedupe_key": string | null,"description": string | null,"dossier_id": string | null,"dossier_reference": string | null,"dossier_start_date": string | null,"due_at": string | null,"financial_risk": boolean | null,"id": string | null,"last_action_at": string | null,"manual_priority": string | null,"manual_priority_reason": string | null,"next_follow_up_at": string | null,"priority": string | null,"priority_rank": number | null,"priority_reason": string | null,"proof_document_id": string | null,"service_id": string | null,"source": string | null,"status": Database["public"]['Enums']["task_status"] | null,"title": string | null,"updated_at": string | null,"waiting_reason": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_deadline_id_fkey"
      columns: ["deadline_id"]
isOneToOne: false
      referencedRelation: "external_deadlines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossier_financials"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "dossiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_dossier_id_fkey"
      columns: ["dossier_id"]
isOneToOne: false
      referencedRelation: "portal_dossier_balances"
      referencedColumns: ["dossier_id"]
    },{
      foreignKeyName: "tasks_proof_document_id_fkey"
      columns: ["proof_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"treasury_balances": {
                  Row: {
                    "account_code": string | null,"balance": number | null,"currency": string | null,"id": string | null,"kind": string | null,"name": string | null,"opening_balance": number | null,"opening_date": string | null,"unreconciled_count": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "treasury_accounts_account_code_fkey"
      columns: ["account_code"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["code"]
    }
                  ]
                }
          }
          Functions: {
            "accept_quote_version":
{ Args: { "p_note"?: string,"p_version_id": string }; Returns: string
                           },
"allocate_supplier_invoice":
{ Args: { "p_amount"?: number,"p_cost_kind"?: string,"p_method"?: string,"p_supplier_invoice_id": string,"p_targets": Json }; Returns: {
              "amount": number,
"amount_tnd": number,
"basis": NonNullable<Json>,
"cost_kind": string,
"created_at": string,
"created_by": string | null,
"departure_id": string | null,
"dossier_id": string | null,
"id": string,
"method": string,
"service_id": string | null,
"status": string,
"supplier_invoice_id": string,
"supplier_invoice_line_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "cost_allocations"
        isOneToOne: false
        isSetofReturn: true
      } },
"can_read_document":
{ Args: { "p_doc": Database["public"]['Tables']["documents"]['Row'] }; Returns: boolean
                           },
"can_see_margins":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"cancel_draft_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: undefined
                           },
"close_dossier_financially":
{ Args: { "p_dossier_id": string,"p_exception_reason"?: string }; Returns: undefined
                           },
"close_fiscal_period":
{ Args: { "p_period_id": string }; Returns: undefined
                           },
"commit_import_batch":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"confirm_departure_hold":
{ Args: { "p_hold_id": string }; Returns: undefined
                           },
"confirm_dossier":
{ Args: { "p_derogation_reason"?: string,"p_dossier_id": string }; Returns: undefined
                           },
"create_deposit_slip":
{ Args: { "p_date"?: string,"p_payment_ids": (string)[],"p_treasury_account_id": string }; Returns: string
                           },
"create_quote_version":
{ Args: { "p_from_version_id"?: string,"p_quote_id": string }; Returns: string
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"dashboard_counters":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"dossier_confirmation_blockers":
{ Args: { "p_dossier_id": string }; Returns: {
              "code": string,"message": string
            }[]
                           },
"dossier_paid_amount":
{ Args: { "p_dossier_id": string }; Returns: number
                           },
"draft_entry_from_rule":
{ Args: { "p_amount": number,"p_client_id"?: string,"p_credit_override"?: string,"p_date": string,"p_debit_override"?: string,"p_dossier_id"?: string,"p_event": string,"p_label": string,"p_piece_ref": string,"p_source_id": string,"p_source_type": string,"p_supplier_id"?: string }; Returns: string
                           },
"expire_departure_options":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"find_client_duplicates":
{ Args: { "p_email": string,"p_name"?: string,"p_phone": string }; Returns: {
              "display_name": string,"email": string,"id": string,"match_reason": string,"phone": string
            }[]
                           },
"generate_departure_checklist":
{ Args: { "p_dossier_id": string }; Returns: number
                           },
"has_perm":
{ Args: { "p_action": Database["public"]['Enums']["perm_action"],"p_module": string }; Returns: boolean
                           },
"hold_departure_seats":
{ Args: { "p_departure_id": string,"p_dossier_id"?: string,"p_expires_at"?: string,"p_kind": string,"p_lead_id"?: string,"p_seats": number }; Returns: {
              "created_at": string,
"created_by": string | null,
"departure_id": string,
"dossier_id": string | null,
"expires_at": string | null,
"id": string,
"kind": string,
"lead_id": string | null,
"released_at": string | null,
"seats": number,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "departure_holds"
        isOneToOne: true
        isSetofReturn: false
      } },
"invoice_credited_amount":
{ Args: { "p_invoice_id": string }; Returns: number
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"management_kpis":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "collected": number,"cost_planned": number,"dimension": string,"invoiced_net": number,"key": string,"margin_forecast": number,"provisional_count": number,"sales_planned": number
            }[]
                           },
"mark_quote_version_sent":
{ Args: { "p_version_id": string,"p_via"?: string }; Returns: undefined
                           },
"merge_clients":
{ Args: { "p_keep": string,"p_merge": string,"p_reason": string }; Returns: undefined
                           },
"next_number":
{ Args: { "p_code": string,"p_date"?: string }; Returns: string
                           },
"offer_is_public":
{ Args: { "o": Database["public"]['Tables']["offers"]['Row'] }; Returns: boolean
                           },
"period_is_open":
{ Args: { "p_date": string }; Returns: boolean
                           },
"portal_client_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"post_journal_entry":
{ Args: { "p_entry_id": string }; Returns: string
                           },
"process_payment_event":
{ Args: { "p_amount": number,"p_event_id": string,"p_event_type": string,"p_payload": Json,"p_provider": string,"p_session_id": string,"p_signature_valid": boolean }; Returns: string
                           },
"record_payment":
{ Args: { "p_allocations"?: Json,"p_amount": number,"p_client_id"?: string,"p_currency"?: string,"p_direction": string,"p_due_date"?: string,"p_external_ref"?: string,"p_fees"?: number,"p_fx_rate"?: number,"p_idempotency_key": string,"p_instrument_number"?: string,"p_kind"?: string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes"?: string,"p_received_at"?: string,"p_supplier_id"?: string,"p_treasury_account_id"?: string,"p_validate"?: boolean,"p_withholding"?: number }; Returns: {
              "amount": number,
"amount_tnd": number | null,
"client_id": string | null,
"created_at": string,
"created_by": string | null,
"currency": string,
"deposit_slip_id": string | null,
"direction": string,
"drawer_bank": string | null,
"due_date": string | null,
"external_ref": string | null,
"fees": number,
"fx_rate": number,
"fx_rate_date": string | null,
"fx_rate_source": string | null,
"id": string,
"idempotency_key": string | null,
"instrument_number": string | null,
"kind": string,
"method": Database["public"]['Enums']["payment_method"],
"notes": string | null,
"online_intent_id": string | null,
"proof_document_id": string | null,
"received_at": string,
"reference": string,
"rejection_reason": string | null,
"reversal_of_id": string | null,
"status": Database["public"]['Enums']["payment_status"],
"supplier_id": string | null,
"treasury_account_id": string | null,
"validated_at": string | null,
"validated_by": string | null,
"value_date": string | null,
"withholding_amount": number
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"reject_payment":
{ Args: { "p_fees"?: number,"p_payment_id": string,"p_reason": string }; Returns: undefined
                           },
"release_departure_hold":
{ Args: { "p_hold_id": string,"p_new_status"?: string }; Returns: undefined
                           },
"reopen_fiscal_period":
{ Args: { "p_period_id": string,"p_reason": string }; Returns: undefined
                           },
"require_perm":
{ Args: { "p_action": Database["public"]['Enums']["perm_action"],"p_module": string }; Returns: undefined
                           },
"reverse_journal_entry":
{ Args: { "p_date"?: string,"p_entry_id": string,"p_reason": string }; Returns: string
                           },
"reverse_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: string
                           },
"set_dossier_status":
{ Args: { "p_dossier_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["dossier_status"] }; Returns: undefined
                           },
"submit_site_request":
{ Args: { "p": Json }; Returns: Json
                           },
"task_priority":
{ Args: { "p_now"?: string,"t": Database["public"]['Tables']["tasks"]['Row'] }; Returns: {
              "level": string,"reason": string
            }[]
                           },
"tax_rule_at":
{ Args: { "p_code": string,"p_date": string }; Returns: {
              "code": string,
"effective_from": string,
"effective_to": string | null,
"fixed_amount": number | null,
"id": string,
"kind": string,
"label": string,
"rate": number | null,
"validated_by_accountant": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "tax_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"transfer_funds":
{ Args: { "p_amount": number,"p_date"?: string,"p_from": string,"p_label"?: string,"p_to": string }; Returns: string
                           },
"trial_balance":
{ Args: { "p_from"?: string,"p_to"?: string }; Returns: {
              "account_code": string,"account_label": string,"balance": number,"credit": number,"debit": number
            }[]
                           },
"validate_invoice":
{ Args: { "p_invoice_id": string,"p_issue_date"?: string }; Returns: string
                           },
"validate_payment":
{ Args: { "p_payment_id": string,"p_value_date"?: string }; Returns: undefined
                           },
"validate_supplier_invoice":
{ Args: { "p_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "activity": "hotel_tn"|"hotel_intl"|"tailor_made"|"organized_trip"|"visa"|"ticketing"|"circuit"|"transport"|"mice","app_role": "direction"|"commercial"|"operations"|"finance"|"site","client_kind": "person"|"company","departure_status": "open"|"closed"|"cancelled","document_kind": "passport"|"id_card"|"visa"|"photo"|"voucher"|"ticket"|"program"|"quote_pdf"|"invoice_pdf"|"receipt"|"contract"|"supplier_confirmation"|"supplier_invoice"|"payment_proof"|"import_source"|"other","dossier_status": "request"|"quote_prepared"|"quote_sent"|"accepted"|"booking"|"confirmed"|"travelling"|"completed"|"archived"|"cancelled","invoice_kind": "proforma"|"invoice"|"credit_note","invoice_status": "draft"|"validated"|"cancelled","lead_source": "website"|"phone"|"walk_in"|"email"|"whatsapp"|"social"|"referral"|"import"|"other","lead_stage": "received"|"qualification"|"quote"|"follow_up"|"won"|"lost","pax_type": "adult"|"child"|"infant"|"all","payment_method": "cash"|"transfer"|"card"|"cheque"|"bill"|"online","payment_status": "planned"|"received"|"deposited"|"validated"|"rejected"|"cancelled","perm_action": "read"|"create"|"update"|"export"|"validate"|"archive","price_basis": "per_person"|"total"|"from","publication_status": "draft"|"review"|"published"|"hidden"|"archived","quote_status": "draft"|"sent"|"accepted"|"rejected"|"expired"|"superseded","service_status": "requested"|"option"|"confirmed"|"cancelled","service_type": "flight"|"hotel"|"transfer"|"excursion"|"visa"|"transport"|"circuit"|"package"|"event_item"|"insurance"|"fee"|"other","supplier_kind": "hotel"|"hotel_platform"|"airline"|"ticketing_platform"|"transport"|"guide"|"restaurant"|"venue"|"event_service"|"visa_center"|"insurance"|"other","task_status": "todo"|"in_progress"|"waiting_client"|"waiting_supplier"|"blocked"|"done"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "activity": ["hotel_tn", "hotel_intl", "tailor_made", "organized_trip", "visa", "ticketing", "circuit", "transport", "mice"],"app_role": ["direction", "commercial", "operations", "finance", "site"],"client_kind": ["person", "company"],"departure_status": ["open", "closed", "cancelled"],"document_kind": ["passport", "id_card", "visa", "photo", "voucher", "ticket", "program", "quote_pdf", "invoice_pdf", "receipt", "contract", "supplier_confirmation", "supplier_invoice", "payment_proof", "import_source", "other"],"dossier_status": ["request", "quote_prepared", "quote_sent", "accepted", "booking", "confirmed", "travelling", "completed", "archived", "cancelled"],"invoice_kind": ["proforma", "invoice", "credit_note"],"invoice_status": ["draft", "validated", "cancelled"],"lead_source": ["website", "phone", "walk_in", "email", "whatsapp", "social", "referral", "import", "other"],"lead_stage": ["received", "qualification", "quote", "follow_up", "won", "lost"],"pax_type": ["adult", "child", "infant", "all"],"payment_method": ["cash", "transfer", "card", "cheque", "bill", "online"],"payment_status": ["planned", "received", "deposited", "validated", "rejected", "cancelled"],"perm_action": ["read", "create", "update", "export", "validate", "archive"],"price_basis": ["per_person", "total", "from"],"publication_status": ["draft", "review", "published", "hidden", "archived"],"quote_status": ["draft", "sent", "accepted", "rejected", "expired", "superseded"],"service_status": ["requested", "option", "confirmed", "cancelled"],"service_type": ["flight", "hotel", "transfer", "excursion", "visa", "transport", "circuit", "package", "event_item", "insurance", "fee", "other"],"supplier_kind": ["hotel", "hotel_platform", "airline", "ticketing_platform", "transport", "guide", "restaurant", "venue", "event_service", "visa_center", "insurance", "other"],"task_status": ["todo", "in_progress", "waiting_client", "waiting_supplier", "blocked", "done", "cancelled"]
          }
        }
} as const
