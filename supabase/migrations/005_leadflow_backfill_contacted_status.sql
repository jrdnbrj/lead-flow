update public.leads
set status = 'CONTACTADO'
where status = 'NUEVO'
  and (
    whatsapp_status in ('SENT', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED', 'RECEIVED')
    or exists (
      select 1
      from public.lead_messages
      where lead_messages.lead_id = leads.id
        and lead_messages.direction in ('OUTBOUND', 'INBOUND')
    )
  );
