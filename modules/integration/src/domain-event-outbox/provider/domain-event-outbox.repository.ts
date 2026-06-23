import { DomainEventOutbox } from '../model';

export interface DomainEventOutboxRepository {
  create(data: DomainEventOutbox): Promise<DomainEventOutbox>;
  update(data: DomainEventOutbox): Promise<DomainEventOutbox>;
  findUnpublished(limit: number): Promise<DomainEventOutbox[]>;
}
