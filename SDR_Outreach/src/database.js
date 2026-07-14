import { Sequelize, DataTypes } from 'sequelize';
import path from 'path';
import os from 'os';

const DATABASE_URL = process.env.DATABASE_URL || 'sqlite:d:/SDR_Ai_tool/SDR_Outreach/sdr_outreach.sqlite';

export const sequelize = new Sequelize(DATABASE_URL, {
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  }
});

// 1. Lead Model
export const Lead = sequelize.define('Lead', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  brandName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'brand_name'
  },
  website: {
    type: DataTypes.STRING,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pipelineStage: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'pipeline_stage'
  },
  sheetRowNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'sheet_row_number'
  }
});

// 2. CompanyResearch Model
export const CompanyResearch = sequelize.define('CompanyResearch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  overview: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  products: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  newsSignals: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'news_signals'
  },
  hiringSignals: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'hiring_signals'
  }
}, { tableName: 'company_research' });

// 3. MarketplacePresence Model
export const MarketplacePresence = sequelize.define('MarketplacePresence', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  marketplace: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  storeUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'store_url'
  },
  skuCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'sku_count'
  },
  avgRating: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'avg_rating'
  },
  reviewCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'review_count'
  },
  priceMin: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'price_min'
  },
  priceMax: {
    type: DataTypes.FLOAT,
    allowNull: true,
    field: 'price_max'
  },
  bestSellers: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'best_sellers'
  },
  sellerNames: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'seller_names'
  },
  categoryRankings: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'category_rankings'
  },
  deliveryAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    field: 'delivery_available'
  },
  lastScraped: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'last_scraped'
  }
}, { tableName: 'marketplace_presence' });

// 4. ReviewIntelligence Model
export const ReviewIntelligence = sequelize.define('ReviewIntelligence', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  marketplace: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  topComplaints: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'top_complaints'
  },
  affectedProducts: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'affected_products'
  },
  sentimentTrend: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'sentiment_trend'
  },
  reviewsUnanswered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'reviews_unanswered'
  },
  deliveryMentions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'delivery_mentions'
  },
  packagingMentions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'packaging_mentions'
  },
  productQualityMentions: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'product_quality_mentions'
  },
  lastAnalyzed: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'last_analyzed'
  }
}, { tableName: 'review_intelligence' });

// 5. ReputationSummary Model
export const ReputationSummary = sequelize.define('ReputationSummary', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  weakestMarketplace: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'weakest_marketplace'
  },
  overallReputationSummary: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'overall_reputation_summary'
  }
}, { tableName: 'reputation_summaries' });

// 6. OpportunityScore Model
export const OpportunityScore = sequelize.define('OpportunityScore', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  totalScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'total_score'
  },
  marketplacePresenceScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'marketplace_presence_score'
  },
  monthlyReviewsScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'monthly_reviews_score'
  },
  negativeReviewsScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'negative_reviews_score'
  },
  reviewResponseRateScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'review_response_rate_score'
  },
  growthSignalsScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'growth_signals_score'
  },
  hiringScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'hiring_score'
  },
  reasons: {
    type: DataTypes.JSON,
    allowNull: true
  },
  calculatedAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'calculated_at'
  }
}, { tableName: 'opportunity_scores' });

// 7. Contact Model
export const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  designation: {
    type: DataTypes.STRING,
    allowNull: true
  },
  linkedinUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'linkedin_url'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  sources: {
    type: DataTypes.JSON,
    allowNull: true
  },
  confidenceScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    field: 'confidence_score'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_verified'
  }
});

// 8. OutreachState Model
export const OutreachState = sequelize.define('OutreachState', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'contact_id'
  },
  currentState: {
    type: DataTypes.STRING(50),
    defaultValue: 'INITIALIZED',
    field: 'current_state'
  },
  lastTransitionAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    field: 'last_transition_at'
  },
  nextActionAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_action_at'
  },
  followUpCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'follow_up_count'
  }
}, { tableName: 'outreach_states' });

// 9. OutreachHistory Model
export const OutreachHistory = sequelize.define('OutreachHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'contact_id'
  },
  channel: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  sentText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sent_text'
  },
  receivedText: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'received_text'
  },
  direction: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
}, { tableName: 'outreach_history' });

// 10. CRMEventLedger Model
export const CRMEventLedger = sequelize.define('CRMEventLedger', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  eventType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'event_type'
  },
  metadataJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata_json'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
}, { tableName: 'crm_event_ledger' });

// 11. Meeting Model
export const Meeting = sequelize.define('Meeting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  contactId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'contact_id'
  },
  meetingDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'meeting_date'
  },
  meetingTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'meeting_time'
  },
  meetLink: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'meet_link'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'SCHEDULED'
  }
});

// 12. AdminMetrics Model
export const AdminMetrics = sequelize.define('AdminMetrics', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  totalLeads: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_leads'
  },
  contactsFound: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'contacts_found'
  },
  acceptedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'accepted_count'
  },
  meetingsScheduled: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'meetings_scheduled'
  },
  dealsWon: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'deals_won'
  },
  revenue: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  }
}, { tableName: 'admin_metrics' });

// 13. ResearchProfile Model
export const ResearchProfile = sequelize.define('ResearchProfile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  leadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'lead_id'
  },
  companyOverview: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'company_overview'
  },
  products: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  marketplacePresence: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'marketplace_presence'
  },
  customerPainPoints: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'customer_pain_points'
  },
  reviewAnalysis: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'review_analysis'
  },
  competitors: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  whyNeedReviewManagement: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'why_need_review_management'
  },
  personalizedSalesAngle: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'personalized_sales_angle'
  }
}, { tableName: 'research_profiles' });

// Define Relations
Lead.hasMany(CompanyResearch, { foreignKey: 'leadId', as: 'researches' });
CompanyResearch.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasMany(MarketplacePresence, { foreignKey: 'leadId', as: 'marketplaces' });
MarketplacePresence.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasMany(ReviewIntelligence, { foreignKey: 'leadId', as: 'reviews' });
ReviewIntelligence.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasOne(ReputationSummary, { foreignKey: 'leadId', as: 'reputationSummary' });
ReputationSummary.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasOne(OpportunityScore, { foreignKey: 'leadId', as: 'opportunityScore' });
OpportunityScore.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasMany(Contact, { foreignKey: 'leadId', as: 'contacts' });
Contact.belongsTo(Lead, { foreignKey: 'leadId' });

Contact.hasMany(OutreachState, { foreignKey: 'contactId', as: 'outreachStates' });
OutreachState.belongsTo(Contact, { foreignKey: 'contactId' });

Lead.hasMany(OutreachState, { foreignKey: 'leadId', as: 'outreachStates' });
OutreachState.belongsTo(Lead, { foreignKey: 'leadId' });

Contact.hasMany(OutreachHistory, { foreignKey: 'contactId', as: 'outreachHistories' });
OutreachHistory.belongsTo(Contact, { foreignKey: 'contactId' });

Lead.hasMany(OutreachHistory, { foreignKey: 'leadId', as: 'outreachHistories' });
OutreachHistory.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasMany(CRMEventLedger, { foreignKey: 'leadId', as: 'crmEvents' });
CRMEventLedger.belongsTo(Lead, { foreignKey: 'leadId' });

Lead.hasMany(Meeting, { foreignKey: 'leadId', as: 'meetings' });
Meeting.belongsTo(Lead, { foreignKey: 'leadId' });

Contact.hasMany(Meeting, { foreignKey: 'contactId', as: 'meetings' });
Meeting.belongsTo(Contact, { foreignKey: 'contactId' });

Lead.hasOne(ResearchProfile, { foreignKey: 'leadId', as: 'researchProfile' });
ResearchProfile.belongsTo(Lead, { foreignKey: 'leadId' });

export async function initDb() {
  await sequelize.sync({ force: false });
}
